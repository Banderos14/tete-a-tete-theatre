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

// Занимает ли бронь место в зале.
// Отменённые и протухшие брони вместимость не занимают.
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
