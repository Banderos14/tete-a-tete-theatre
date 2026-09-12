// Проверка билета и отметка прохода.
//
// Всё выполняется ОДНОЙ транзакцией: прочитать бронь → проверить → отметить.
// Два администратора, одновременно отсканировавшие один код, не должны оба
// получить успешный проход — второй гарантированно получает already_attended.

import { FieldValue } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { bookingOccurrenceStartUtcMs, showEndUtcMs } from '../../shared/domain/showTime.js';
import { SHOWS, showDateString } from '../../shared/catalog/shows.js';
import type { BookingOccurrence } from '../../shared/domain/showTime.js';
import type {
  CheckinAction, CheckinBooking, CheckinRefusalReason, ShowRelevance,
} from '../../shared/contracts/checkin.js';
import { db, findByTicketCode } from '../booking/booking.repository.js';

const TICKET_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Насколько раньше начала спектакля билет уже принимается на входе.
const DOORS_OPEN_BEFORE_MS = 4 * 60 * 60 * 1000;
// Насколько поздно после окончания билет ещё считается «сегодняшним».
const GRACE_AFTER_END_MS   = 3 * 60 * 60 * 1000;

/**
 * Билет прошлого месяца не должен считаться действительным только потому, что
 * код существует.
 *
 * Момент берётся из САМОЙ БРОНИ, а не из каталога. Каталог отвечает на вопрос
 * «что играем сейчас», и его дату можно перенести; бронь отвечает на вопрос
 * «на какой вечер продан этот билет», и он зафиксирован в момент покупки.
 * Пока считали по каталогу, перенос romantika с 14 Июн на 17 Сен делал
 * июньские билеты действительными на сентябрьский показ.
 */
function relevanceOf(data: Record<string, unknown>, nowMs: number): ShowRelevance {
  const startMs = bookingOccurrenceStartUtcMs(data as BookingOccurrence);

  if (startMs === null) return 'unknown';
  if (nowMs < startMs - DOORS_OPEN_BEFORE_MS) return 'too_early';
  if (nowMs > showEndUtcMs(startMs) + GRACE_AFTER_END_MS) return 'too_late';
  return 'ok';
}

/**
 * Дата брони разошлась с датой того же спектакля в каталоге.
 *
 * Признак информационный: действительность билета решает relevanceOf по
 * сеансу самой брони, а этот флаг объясняет сотруднику ПОЧЕМУ — спектакль
 * с тем же id идёт сегодня, но билет выписан на другой вечер. Без него
 * карточка «Билет на прошедший спектакль» выглядела бы ошибкой сканера
 * в тот самый день, когда спектакль с этим названием действительно идёт.
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
      // Сеанс, на который выписан билет, уже отыгран. Раньше это не пускала
      // только карточка сканера, а endpoint отмечал проход — и перенос даты
      // спектакля открывал старым билетам бесплатный вход. Проверка стоит
      // ПОСЛЕ already_attended и cancelled: у использованного билета причина
      // «уже использован» точнее, чем «спектакль прошёл».
      if (booking.showRelevance === 'too_late') {
        return { kind: 'refused', refusal: 'show_over', message: 'Show already ended', booking };
      }
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
    // То же правило, что и для прохода: по билету на отыгранный вечер нельзя
    // ни войти, ни заплатить. Иначе оставалась половинчатая дыра — деньги
    // приняты и бронь переведена в confirmed, а в зал всё равно не пускают.
    if (booking.showRelevance === 'too_late') {
      return { kind: 'refused', refusal: 'show_over', message: 'Show already ended', booking };
    }

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
