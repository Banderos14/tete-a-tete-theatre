// Программа лояльности на сервере.
//
// Зеркалит src/features/booking/services/loyalty.ts: 1 посещение = 1 бронь,
// каждые 5 посещений — одна скидка 50 %. Здесь функции чистые, чтобы правило
// можно было проверить тестом, не поднимая Firestore.

import { isBookingAttended } from '../../shared/domain/bookingRules.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import type { RawBooking } from './booking.types.js';

export const LOYALTY_REWARD_INTERVAL = 5;
const LOYALTY_DISCOUNT_DIVISOR = 2;

function attendedAt(b: RawBooking, nowMs: number): boolean {
  // Время начала: у новых броней хранится полем showStartAt, у старых
  // восстанавливается из строк как настенное время Europe/Paris.
  const start = typeof b.showStartAtMs === 'number'
    ? b.showStartAtMs
    : parseShowStartUtcMs(b.showDate ?? '', b.showTime ?? '');

  return isBookingAttended(
    { status: String(b.status ?? ''), paymentStatus: String(b.paymentStatus ?? '') },
    start,
    nowMs,
  );
}

export interface LoyaltyState {
  loyaltyAvailable: boolean;
  attendedCount:    number;
  usedCount:        number;
}

/**
 * Доступен ли бонус.
 *
 * usedFromState — счётчик израсходованных бонусов из loyaltyState/{uid}.
 * Берём максимум из него и фактической истории броней: любое расхождение
 * трактуется в пользу театра, а не двойной скидки.
 */
export function computeLoyalty(
  bookings: RawBooking[], nowMs: number, usedFromState = 0,
): LoyaltyState {
  const attended     = bookings.filter(b => attendedAt(b, nowMs)).length;
  const usedFromHist = bookings.filter(b => b.loyaltyDiscountApplied === true).length;
  const usedCount    = Math.max(usedFromHist, usedFromState);

  return {
    loyaltyAvailable: attended >= LOYALTY_REWARD_INTERVAL
      && Math.floor(attended / LOYALTY_REWARD_INTERVAL) > usedCount,
    attendedCount: attended,
    usedCount,
  };
}

export function loyaltyDiscount(baseAmount: number): number {
  return Math.floor(baseAmount / LOYALTY_DISCOUNT_DIVISOR);
}
