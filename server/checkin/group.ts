// Группа броней на входе: все активные брони ОДНОГО аккаунта на ОДИН сеанс.
//
// Чистая логика без Firestore — состав группы и суммы проверяются юнит-тестами,
// а сервис лишь применяет вердикт внутри транзакции.
//
// Ключ группы — userId + showId + точный момент начала сеанса. Не e-mail, не
// имя и не телефон: совпадение контактов не доказывает, что это один зритель.
// Момент берётся из самой брони (showStartAt, у старых — showDate + showTime),
// поэтому билет на другой вечер того же спектакля в группу не попадает.

import { occupiesCapacity } from '../../shared/domain/bookingRules.js';
import { bookingOccurrenceStartUtcMs, type BookingOccurrence } from '../../shared/domain/showTime.js';
import type { CheckinBooking, CheckinGroup, ShowRelevance } from '../../shared/contracts/checkin.js';

export interface GroupDoc {
  id:   string;
  data: Record<string, unknown>;
}

export interface GroupKey {
  userId:  string;
  showId:  string;
  startMs: number;
}

/** Ключ группы брони либо null, если бронь нельзя безопасно связать с другими. */
export function groupKeyOf(data: Record<string, unknown>): GroupKey | null {
  const userId = typeof data.userId === 'string' ? data.userId.trim() : '';
  const showId = typeof data.showId === 'string' ? data.showId.trim() : '';
  if (!userId || !showId) return null;

  const startMs = bookingOccurrenceStartUtcMs(data as BookingOccurrence);
  if (startMs === null) return null;

  return { userId, showId, startMs };
}

/** Активная бронь — та же, что занимает место в зале: не отменена и не протухла. */
export function isActiveBooking(data: Record<string, unknown>): boolean {
  return occupiesCapacity({
    status:        String(data.status ?? ''),
    paymentStatus: String(data.paymentStatus ?? ''),
  });
}

function sameGroup(data: Record<string, unknown>, key: GroupKey): boolean {
  const other = groupKeyOf(data);
  return other !== null
    && other.userId  === key.userId
    && other.showId  === key.showId
    && other.startMs === key.startMs;
}

/**
 * Брони группы отсканированной брони.
 *
 * null — группы нет: отсканированная бронь отменена/протухла (её QR не должен
 * открывать проход по другим броням аккаунта) или у неё нет userId/сеанса.
 * Порядок не зависит от того, какой QR отсканирован.
 */
export function selectGroupMembers<T extends GroupDoc>(root: T, candidates: T[]): T[] | null {
  if (!isActiveBooking(root.data)) return null;
  const key = groupKeyOf(root.data);
  if (!key) return null;

  const members = candidates.filter(c => isActiveBooking(c.data) && sameGroup(c.data, key));
  if (!members.some(m => m.id === root.id)) members.push(root);

  return members.sort((a, b) => String(a.data.ticketCode ?? a.id).localeCompare(String(b.data.ticketCode ?? b.id)));
}

export const isAttended = (b: CheckinBooking): boolean => b.status === 'attended';
export const isPaid     = (b: CheckinBooking): boolean => b.paymentStatus === 'paid';

/** Оплата на месте, деньги ещё не получены — их принимает сотрудник на входе. */
export const isCashDue = (b: CheckinBooking): boolean =>
  b.paymentMethod === 'on_site' && b.paymentStatus === 'not_paid';

/**
 * Непрошедшая бронь, по которой нельзя пройти прямо сейчас: не оплачена и
 * оплату нельзя принять на входе (ожидается банковский перевод и т. п.).
 */
export const isBlocked = (b: CheckinBooking): boolean =>
  !isAttended(b) && !isPaid(b) && !isCashDue(b);

/** Сводка группы. Суммы — из сохранённого totalAmount (скидка уже учтена). */
export function summarizeGroup(
  scannedBookingId: string, bookings: CheckinBooking[], showRelevance: ShowRelevance,
): CheckinGroup {
  let totalTickets = 0, attendedTickets = 0, paidAmount = 0, cashDue = 0, remainingBookings = 0;
  const blockedBookingIds: string[] = [];

  for (const b of bookings) {
    totalTickets += b.seatsCount;
    if (isPaid(b)) paidAmount += b.totalAmount;

    if (isAttended(b)) { attendedTickets += b.seatsCount; continue; }

    remainingBookings += 1;
    if (isCashDue(b)) cashDue += b.totalAmount;
    if (isBlocked(b)) blockedBookingIds.push(b.bookingId);
  }

  return {
    scannedBookingId,
    bookings,
    bookingsCount:    bookings.length,
    totalTickets,
    attendedTickets,
    remainingTickets: totalTickets - attendedTickets,
    paidAmount,
    cashDue,
    remainingBookings,
    blockedBookingIds,
    showRelevance,
    canCheckIn: remainingBookings > 0
      && blockedBookingIds.length === 0
      && showRelevance !== 'too_late'
      && showRelevance !== 'unknown',
  };
}
