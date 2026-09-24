// Проверка билета и отметка прохода.
//
// Всё выполняется ОДНОЙ транзакцией: прочитать бронь → проверить → отметить.
// Два администратора, одновременно отсканировавшие один код, не должны оба
// получить успешный проход — второй гарантированно получает already_attended.

import { FieldValue } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { SHOWS } from '../../shared/catalog/shows.js';
import { ticketBreakdownLabel } from '../../shared/catalog/ticketTypes.js';
import { bookingTicketLines } from '../../shared/domain/ticketBasket.js';
import { isBookingForShow, isKnownShow } from '../../shared/domain/performance.js';
import type { CheckinAction, CheckinBooking, CheckinRefusalReason } from '../../shared/contracts/checkin.js';
import { db, findByTicketCode } from '../booking/booking.repository.js';
import { timestampToMs } from '../booking/booking.types.js';

export const TICKET_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Спектакль, на котором стоит сотрудник: null — не указан (просмотр из админки). */
export function parseShowId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!isKnownShow(raw)) throw badRequest('Unknown show', 'bad_show');
  return raw;
}

/**
 * Тариф брони для сканера. Бронь одного тарифа — его название, как раньше;
 * несколько тарифов — состав «2 × Обычный, 2 × Ученик / студент».
 */
function ticketTypeLabelOf(data: Record<string, unknown>): string {
  const lines = bookingTicketLines(data);
  if (lines.length > 1) return ticketBreakdownLabel(lines, 'RU');
  const show = typeof data.showId === 'string' ? SHOWS[data.showId] : undefined;
  const type = typeof data.ticketType === 'string' ? data.ticketType : '';
  return (show?.tickets as Record<string, { label: string } | undefined> | undefined)?.[type]?.label ?? '';
}

/**
 * Поля перехода «оплата получена на входе».
 *
 * Один набор на все пути: одиночный mark_paid и групповой проход пишут одно и
 * то же, поэтому второй, несовместимой машины состояний не появляется.
 */
export function paidTransition(adminUid: string) {
  return {
    paymentStatus: 'paid',
    status:        'confirmed',
    paidAt:        FieldValue.serverTimestamp(),
    paidBy:        adminUid,
    updatedAt:     FieldValue.serverTimestamp(),
  };
}

/** Поля перехода «зритель прошёл в зал» — общие для одиночного и группового прохода. */
export function attendedTransition(adminUid: string) {
  return {
    status:     'attended',
    attendedAt: FieldValue.serverTimestamp(),
    attendedBy: adminUid,
    updatedAt:  FieldValue.serverTimestamp(),
  };
}

export function snapshotOf(id: string, ticketCode: string, data: Record<string, unknown>, showId: string | null): CheckinBooking {
  return {
    bookingId:     id,
    ticketCode,
    showId:        String(data.showId ?? ''),
    showTitle:     String(data.showTitle ?? ''),
    showDate:      String(data.showDate ?? ''),
    showTime:      String(data.showTime ?? ''),
    userName:      String(data.userName ?? ''),
    userEmail:     String(data.userEmail ?? ''),
    lang:          data.lang === 'FR' ? 'FR' : 'RU',
    ticketsCount:  typeof data.ticketsCount === 'number' ? data.ticketsCount : 1,
    seatsCount:    typeof data.seatsCount === 'number'
      ? data.seatsCount
      : typeof data.ticketsCount === 'number' ? data.ticketsCount : 1,
    totalAmount:   typeof data.totalAmount === 'number' ? data.totalAmount : 0,
    status:        String(data.status ?? ''),
    paymentStatus: String(data.paymentStatus ?? ''),
    paymentMethod: String(data.paymentMethod ?? ''),
    ticketTypeLabel: ticketTypeLabelOf(data),
    wrongShow:       showId !== null && !isBookingForShow(data, showId),
    attendedAtMs:    timestampToMs(data.attendedAt) ?? null,
  };
}

export interface CheckinInput {
  adminUid:   string;
  ticketCode: unknown;
  action:     unknown;
  /** Спектакль, на котором стоит сотрудник. Обязателен для mark_attended. */
  showId?:    unknown;
}

export interface CheckinResult {
  ok:      true;
  changed: boolean;
  booking: CheckinBooking;
}

// Исход транзакции. Тип объявлен явно: без него вывод схлопывает объединение
// в один объект с необязательными полями, и сужение по `in` перестаёт работать.
type CheckinOutcome =
  | { kind: 'missing' }
  | { kind: 'refused'; refusal: CheckinRefusalReason; message: string; booking: CheckinBooking }
  | { kind: 'done'; booking: CheckinBooking; changed: boolean };

export async function checkinTicket(input: CheckinInput): Promise<CheckinResult> {
  const ticketCode = typeof input.ticketCode === 'string' ? input.ticketCode.trim().toUpperCase() : '';
  const action     = (typeof input.action === 'string' ? input.action : 'inspect') as CheckinAction;

  if (!TICKET_CODE_RE.test(ticketCode)) {
    throw badRequest('Invalid ticket code format', 'bad_code');
  }
  if (action !== 'inspect' && action !== 'mark_attended' && action !== 'mark_paid') {
    throw badRequest('Unknown action');
  }
  const showId = parseShowId(input.showId);
  // Проход без указания спектакля невозможен: иначе билет одного спектакля
  // прошёл бы на другом.
  if (action === 'mark_attended' && showId === null) throw badRequest('showId is required', 'bad_show');

  const database = db();

  const outcome = await database.runTransaction<CheckinOutcome>(async (tx) => {
    const found = await findByTicketCode(tx, ticketCode);
    if (!found) return { kind: 'missing' };

    const { ref, id, data } = found;
    const nowMs   = Date.now();
    const booking = snapshotOf(id, ticketCode, data, showId);
    const { status, paymentStatus } = booking;

    if (action === 'inspect') return { kind: 'done', booking, changed: false };

    if (action === 'mark_attended') {
      if (status === 'attended')    return { kind: 'refused', refusal: 'already_attended', message: 'Ticket already used', booking };
      if (status === 'cancelled')   return { kind: 'refused', refusal: 'cancelled',        message: 'Booking cancelled',   booking };
      if (paymentStatus === 'expired') return { kind: 'refused', refusal: 'expired',          message: 'Booking expired',     booking };
      // Билет другого спектакля не проходит как билет этого — в любое время.
      if (booking.wrongShow)        return { kind: 'refused', refusal: 'wrong_show',       message: 'Ticket is for another show', booking };
      if (paymentStatus !== 'paid') return { kind: 'refused', refusal: 'not_paid',         message: 'Ticket is not paid',  booking };

      tx.update(ref, attendedTransition(input.adminUid));
      return { kind: 'done', booking: { ...booking, status: 'attended', attendedAtMs: nowMs }, changed: true };
    }

    // mark_paid — оплата получена: наличными на входе или переводом (админка).
    if (status === 'cancelled')   return { kind: 'refused', refusal: 'cancelled',    message: 'Booking cancelled', booking };
    // Протухшая бронь уже освободила место в зале: «оплата» вернула бы её
    // в зал в обход проверки вместимости. Групповой проход отказывает так же.
    if (paymentStatus === 'expired') return { kind: 'refused', refusal: 'expired',   message: 'Booking expired',   booking };
    if (paymentStatus === 'paid') return { kind: 'refused', refusal: 'already_paid', message: 'Already paid',      booking };
    // Онлайн-оплату подтверждает только Stripe (webhook), не кнопка «Оплачено».
    if (booking.paymentMethod === 'online') {
      return { kind: 'refused', refusal: 'online_payment', message: 'Online payment is confirmed by Stripe only', booking };
    }
    // Уже прошедшему зрителю оплата не должна возвращать статус «confirmed».
    const { status: confirmed, ...paymentOnly } = paidTransition(input.adminUid);
    tx.update(ref, status === 'attended' ? paymentOnly : { ...paymentOnly, status: confirmed });
    return {
      kind: 'done',
      booking: { ...booking, status: status === 'attended' ? status : confirmed, paymentStatus: 'paid' },
      changed: true,
    };
  });

  if (outcome.kind === 'missing') throw notFound('Ticket not found', 'not_found');
  if (outcome.kind === 'refused') {
    throw conflict(outcome.message, outcome.refusal, { booking: outcome.booking });
  }

  return { ok: true, changed: outcome.changed, booking: outcome.booking };
}
