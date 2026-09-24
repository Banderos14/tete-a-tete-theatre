// Программа лояльности на сервере — адаптер к общему правилу.
//
// Формула и определения живут в shared/domain/loyalty.ts (одна реализация на
// сервер и кабинет). Здесь только перевод «сырых» броней Firestore в вид,
// который понимает правило. Цена считается ТОЛЬКО здесь, в транзакции
// создания брони: клиент скидку лишь показывает.

import { loyaltySummary, type LoyaltyBooking } from '../../shared/domain/loyalty.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import type { RawBooking } from './booking.types.js';

function toLoyaltyBooking(b: RawBooking): LoyaltyBooking {
  return {
    status:        String(b.status ?? ''),
    paymentStatus: String(b.paymentStatus ?? ''),
    showId:        b.showId,
    startMs:       typeof b.showStartAtMs === 'number'
      ? b.showStartAtMs
      : parseShowStartUtcMs(String(b.showDate ?? ''), String(b.showTime ?? '')),
    loyaltyDiscountApplied: b.loyaltyDiscountApplied === true,
  };
}

export interface LoyaltyState {
  loyaltyAvailable: boolean;
  /** Посещённые спектакли (уникальные сеансы с проходом). */
  attendedCount:    number;
  usedCount:        number;
}

/** Доступна ли скидка — по реальным броням пользователя, прочитанным в транзакции. */
export function computeLoyalty(bookings: RawBooking[]): LoyaltyState {
  const s = loyaltySummary(bookings.map(toLoyaltyBooking));
  return { loyaltyAvailable: s.available, attendedCount: s.visits, usedCount: s.used };
}
