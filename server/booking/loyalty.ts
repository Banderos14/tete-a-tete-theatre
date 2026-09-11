// Программа лояльности на сервере.
//
// Зеркалит src/features/booking/services/loyalty.ts: 1 посещение = 1 бронь,
// каждые 5 посещений — одна скидка 50 %. Здесь функции чистые, чтобы правило
// можно было проверить тестом, не поднимая Firestore.

import { isBookingAttended } from '../../shared/domain/bookingRules.js';
import type { RawBooking } from './booking.types.js';

export const LOYALTY_REWARD_INTERVAL = 5;
const LOYALTY_DISCOUNT_DIVISOR = 2;

// Бонус начисляется за ПРИХОД, а не за оплату: засчитываются только брони,
// отмеченные check-in'ом на входе. Время спектакля здесь больше не нужно.
function isAttendedBooking(b: RawBooking): boolean {
  return isBookingAttended({
    status:        String(b.status ?? ''),
    paymentStatus: String(b.paymentStatus ?? ''),
  });
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
  bookings: RawBooking[], usedFromState = 0,
): LoyaltyState {
  const attendedCount = bookings.filter(isAttendedBooking).length;
  const usedFromHist  = bookings.filter(b => b.loyaltyDiscountApplied === true).length;
  const usedCount     = Math.max(usedFromHist, usedFromState);

  return {
    loyaltyAvailable: attendedCount >= LOYALTY_REWARD_INTERVAL
      && Math.floor(attendedCount / LOYALTY_REWARD_INTERVAL) > usedCount,
    attendedCount,
    usedCount,
  };
}

export function loyaltyDiscount(baseAmount: number): number {
  return Math.floor(baseAmount / LOYALTY_DISCOUNT_DIVISOR);
}
