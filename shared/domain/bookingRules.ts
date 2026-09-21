// Чистые правила жизненного цикла брони. Никаких обращений к сети и Firestore —
// поэтому их можно и нужно покрывать юнит-тестами, а сервер лишь применяет вердикт.

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'attended';
export type PaymentStatus = 'not_paid' | 'paid' | 'awaiting_transfer' | 'expired';
export type PaymentMethod = 'on_site' | 'bank_transfer';

export interface BookingStateSnapshot {
  status:        BookingStatus | string;
  paymentStatus: PaymentStatus | string;
  paymentMethod?: PaymentMethod | string;
}

export type CancelRefusal =
  | 'already_cancelled'
  | 'already_attended'
  | 'already_paid'
  | 'show_started';

export interface CancelDecision {
  allowed: boolean;
  reason?: CancelRefusal;
}

// Может ли ЗРИТЕЛЬ отменить свою бронь.
//
// Бизнес-правила владельца проекта:
//   • paid           → нельзя (покупка окончательна, автоматических возвратов нет)
//   • attended       → нельзя
//   • cancelled      → повторно нельзя
//   • иначе          → можно, пока спектакль не начался
export function canUserCancel(
  booking: BookingStateSnapshot,
  showStartUtcMs: number | null,
  nowMs: number = Date.now(),
): CancelDecision {
  if (booking.status === 'cancelled')      return { allowed: false, reason: 'already_cancelled' };
  if (booking.status === 'attended')       return { allowed: false, reason: 'already_attended' };
  if (booking.paymentStatus === 'paid')    return { allowed: false, reason: 'already_paid' };
  if (showStartUtcMs !== null && showStartUtcMs <= nowMs) {
    return { allowed: false, reason: 'show_started' };
  }
  return { allowed: true };
}

// Занимает ли бронь место в зале — это же и определение АКТИВНОЙ брони.
// Отменённые и протухшие брони вместимость не занимают.
//
// Одно правило на всех: транзакция создания брони, /api/show-availability и
// сводка админки считают через него, поэтому «мест свободно» на сайте и
// «броней/билетов» в админке не могут разойтись.
export function occupiesCapacity(booking: BookingStateSnapshot): boolean {
  if (booking.status === 'cancelled')       return false;
  if (booking.paymentStatus === 'expired')  return false;
  return true;
}

// Истёк ли срок оплаты банковского перевода.
export function isTransferOverdue(
  booking: BookingStateSnapshot & { paymentExpiresAtMs?: number | null },
  nowMs: number = Date.now(),
): boolean {
  if (booking.paymentStatus !== 'awaiting_transfer') return false;
  if (booking.status === 'cancelled')                return false;
  const expires = booking.paymentExpiresAtMs;
  return typeof expires === 'number' && expires > 0 && expires < nowMs;
}

// Допустимые причины отмены — те же, что предлагает интерфейс кабинета.
export const CANCEL_REASONS = ['time', 'plans', 'mistake', 'other'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export function isValidCancelReason(value: unknown): value is CancelReason {
  return typeof value === 'string' && (CANCEL_REASONS as readonly string[]).includes(value);
}

// Сколько мест реально занято по списку броней спектакля.
// У семейного пакета seatsCount больше ticketsCount; старые брони без
// seatsCount продолжают считаться по ticketsCount.
export function sumOccupiedTickets(
  bookings: Array<BookingStateSnapshot & { ticketsCount?: number; seatsCount?: number }>,
): number {
  let total = 0;
  for (const b of bookings) {
    if (!occupiesCapacity(b)) continue;
    total += typeof b.seatsCount === 'number' && b.seatsCount > 0
      ? b.seatsCount
      : typeof b.ticketsCount === 'number' && b.ticketsCount > 0
        ? b.ticketsCount
        : 1;
  }
  return total;
}

// Сколько броней активно — ровно те, что учитывает sumOccupiedTickets.
export function countActiveBookings(bookings: BookingStateSnapshot[]): number {
  return bookings.filter(occupiesCapacity).length;
}

export interface CapacityDecision {
  allowed:   boolean;
  remaining: number;
  soldOut:   boolean;
}

// Помещается ли запрошенное количество билетов в оставшуюся вместимость.
export function checkCapacity(
  soldTickets: number, requestedTickets: number, capacity: number,
): CapacityDecision {
  const remaining = Math.max(0, capacity - soldTickets);
  return {
    allowed:   requestedTickets <= remaining,
    remaining,
    soldOut:   remaining <= 0,
  };
}

// Единственная реализация правила «бронь считается посещённой».
// Используется и сервером (расчёт лояльности), и клиентом (отображение статуса),
// поэтому разойтись они больше не могут.
//
// ОПЛАТА НЕ ОЗНАЧАЕТ ПОСЕЩЕНИЕ. Раньше правило выводило посещение из
// «confirmed + paid + спектакль закончился», и оплаченный зритель, который
// не пришёл, автоматически считался пришедшим. Хуже того, админка записывала
// этот вывод в Firestore, так что оплата задним числом превращалась в
// «посещено» без единого скана.
//
// Теперь посещение — это факт прохода, а не вывод из платежа: статус
// 'attended' ставит только успешный check-in (server/checkin/checkin.service).
export function isBookingAttended(booking: BookingStateSnapshot): boolean {
  return booking.status === 'attended';
}

// Есть ли у брони действующий билет с QR.
//
// Одно правило на кабинет и на сервер (класть ли QR в письмо): у ЛЮБОЙ
// действующей брони — оплаченной, «оплата на месте» и с ещё не полученным
// переводом — есть билет. Неоплаченный билет проходит на входе через «принять
// оплату и пропустить». Отменённая, протухшая и уже использованная — нет.
export function isScannableTicket(booking: BookingStateSnapshot): boolean {
  if (booking.status === 'cancelled' || booking.status === 'attended') return false;
  return booking.paymentStatus === 'paid'
    || booking.paymentStatus === 'not_paid'
    || booking.paymentStatus === 'awaiting_transfer';
}

// Бессмысленные сочетания статусов.
//
// Администратор должен иметь возможность починить реальную ситуацию вручную,
// поэтому это НЕ запрет, а предупреждение: интерфейс просит подтверждение,
// а не отказывает. Возвращает описание проблемы или null, если всё логично.
export function describeStateIssue(
  status: string, paymentStatus: string,
): string | null {
  if (status === 'attended' && paymentStatus !== 'paid') {
    return 'Бронь отмечена как посещённая, но не оплачена';
  }
  if (status === 'confirmed' && paymentStatus === 'expired') {
    return 'Бронь подтверждена, но срок оплаты помечен истёкшим';
  }
  if (status === 'cancelled' && paymentStatus === 'paid') {
    return 'Отменённая бронь помечена оплаченной — деньги, возможно, придётся вернуть вручную';
  }
  if (paymentStatus === 'awaiting_transfer' && status === 'confirmed') {
    return 'Бронь подтверждена, хотя перевод ещё ожидается';
  }
  return null;
}
