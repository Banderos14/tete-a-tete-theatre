// Проверка билета и отметка прохода.
//
// Всё выполняется ОДНОЙ транзакцией: прочитать бронь → проверить → отметить.
// Два администратора, одновременно отсканировавшие один код, не должны оба
// получить успешный проход — второй гарантированно получает already_attended.

import { FieldValue } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { parseShowStartUtcMs, showEndUtcMs } from '../../shared/domain/showTime.js';
import { SHOWS, showStartUtcMs, showDateString } from '../../shared/catalog/shows.js';
import type {
  CheckinAction, CheckinBooking, CheckinRefusalReason, ShowRelevance,
} from '../../shared/contracts/checkin.js';
import { db, findByTicketCode } from '../booking/booking.repository.js';

const TICKET_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Насколько раньше начала спектакля билет уже принимается на входе.
const DOORS_OPEN_BEFORE_MS = 4 * 60 * 60 * 1000;
// Насколько поздно после окончания билет ещё считается «сегодняшним».
const GRACE_AFTER_END_MS   = 3 * 60 * 60 * 1000;

/** Билет прошлого месяца не должен считаться действительным только потому, что код существует. */
function relevanceOf(data: Record<string, unknown>, nowMs: number): ShowRelevance {
  const catalogShow = typeof data.showId === 'string' ? SHOWS[data.showId] : undefined;
  const startMs = catalogShow
    ? showStartUtcMs(catalogShow)
    : parseShowStartUtcMs(String(data.showDate ?? ''), String(data.showTime ?? ''));

  if (startMs === null) return 'unknown';
  if (nowMs < startMs - DOORS_OPEN_BEFORE_MS) return 'too_early';
  if (nowMs > showEndUtcMs(startMs) + GRACE_AFTER_END_MS) return 'too_late';
  return 'ok';
}

/**
 * Дата брони разошлась с датой того же спектакля в каталоге.
 *
 * Актуальность (relevanceOf) считается по КАТАЛОГУ — иначе перенос спектакля
 * превратил бы все выданные билеты в «прошедшие». Обратная сторона: если id
 * спектакля переиспользовать под новую постановку того же названия, старая
 * оплаченная бронь снова станет «сегодняшней» и пройдёт на вход бесплатно.
 * Сам по себе флаг ничего не запрещает — он выводит расхождение на карточку,
 * чтобы сотрудник видел, что билет выписан на другой вечер.
 */
function catalogDateDiffers(data: Record<string, unknown>): boolean {
  const catalogShow = typeof data.showId === 'string' ? SHOWS[data.showId] : undefined;
  if (!catalogShow) return false;

  const booked = String(data.showDate ?? '').trim();
  return booked !== '' && booked !== showDateString(catalogShow);
}

function snapshotOf(id: string, ticketCode: string, data: Record<string, unknown>, nowMs: number): CheckinBooking {
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
    totalAmount:   typeof data.totalAmount === 'number' ? data.totalAmount : 0,
    status:        String(data.status ?? ''),
    paymentStatus: String(data.paymentStatus ?? ''),
    paymentMethod: String(data.paymentMethod ?? ''),
    showRelevance:    relevanceOf(data, nowMs),
    showDateDiffers:  catalogDateDiffers(data),
  };
}

export interface CheckinInput {
  adminUid:   string;
  ticketCode: unknown;
  action:     unknown;
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

  const database = db();

  const outcome = await database.runTransaction<CheckinOutcome>(async (tx) => {
    const found = await findByTicketCode(tx, ticketCode);
    if (!found) return { kind: 'missing' };

    const { ref, id, data } = found;
    const nowMs   = Date.now();
    const booking = snapshotOf(id, ticketCode, data, nowMs);
    const { status, paymentStatus } = booking;

    if (action === 'inspect') return { kind: 'done', booking, changed: false };

    if (action === 'mark_attended') {
      if (status === 'attended')    return { kind: 'refused', refusal: 'already_attended', message: 'Ticket already used', booking };
      if (status === 'cancelled')   return { kind: 'refused', refusal: 'cancelled',        message: 'Booking cancelled',   booking };
      if (paymentStatus !== 'paid') return { kind: 'refused', refusal: 'not_paid',         message: 'Ticket is not paid',  booking };

      tx.update(ref, {
        status:     'attended',
        attendedAt: FieldValue.serverTimestamp(),
        attendedBy: input.adminUid,
        updatedAt:  FieldValue.serverTimestamp(),
      });
      return { kind: 'done', booking: { ...booking, status: 'attended' }, changed: true };
    }

    // mark_paid — оплата наличными на входе
    if (status === 'cancelled')   return { kind: 'refused', refusal: 'cancelled',    message: 'Booking cancelled', booking };
    if (paymentStatus === 'paid') return { kind: 'refused', refusal: 'already_paid', message: 'Already paid',      booking };

    tx.update(ref, {
      paymentStatus: 'paid',
      status:        'confirmed',
      paidAt:        FieldValue.serverTimestamp(),
      paidBy:        input.adminUid,
      updatedAt:     FieldValue.serverTimestamp(),
    });
    return { kind: 'done', booking: { ...booking, status: 'confirmed', paymentStatus: 'paid' }, changed: true };
  });

  if (outcome.kind === 'missing') throw notFound('Ticket not found', 'not_found');
  if (outcome.kind === 'refused') {
    throw conflict(outcome.message, outcome.refusal, { booking: outcome.booking });
  }

  return { ok: true, changed: outcome.changed, booking: outcome.booking };
}
