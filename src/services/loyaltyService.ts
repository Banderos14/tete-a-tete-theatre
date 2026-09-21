// Лояльность в кабинете и форме брони — только показ.
//
// Правило одно на сервер и клиент: shared/domain/loyalty.ts («посетите 5
// спектаклей — 6-й билет со скидкой 50 %»). Авторитетную цену считает сервер
// в транзакции создания брони; здесь та же формула нужна, чтобы зритель
// заранее видел скидку.

import type { Booking } from '../types/booking';
import { bookingOccurrenceStartUtcMs } from '../../shared/domain/showTime';
import {
  loyaltySummary as sharedSummary, loyaltyDiscountForTicket, LOYALTY_VISITS_PER_REWARD,
  type LoyaltySummary,
} from '../../shared/domain/loyalty';

export { LOYALTY_VISITS_PER_REWARD, loyaltyDiscountForTicket, type LoyaltySummary };

export function loyaltySummary(bookings: Booking[]): LoyaltySummary {
  return sharedSummary(bookings.map(b => ({
    status:        b.status,
    paymentStatus: b.paymentStatus ?? 'not_paid',
    showId:        b.showId,
    startMs:       bookingOccurrenceStartUtcMs(b as Parameters<typeof bookingOccurrenceStartUtcMs>[0]),
    loyaltyDiscountApplied: b.loyaltyDiscountApplied === true,
  })));
}
