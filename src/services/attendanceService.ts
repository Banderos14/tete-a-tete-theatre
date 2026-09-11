import { isBookingAttended } from '../../shared/domain/bookingRules';
import type { Booking } from '../types/booking';

// Модуль намеренно НЕ импортирует Firebase: это чистое правило, которым
// пользуются и интерфейс, и расчёт лояльности, и тесты.
//
// ОПЛАТА НЕ ОЗНАЧАЕТ ПОСЕЩЕНИЕ. Раньше здесь жил вывод «confirmed + paid +
// спектакль закончился ⇒ посещено», а bookingService записывал этот вывод
// в Firestore при каждом открытии админки. Оплаченный зритель, который не
// пришёл, получал статус «посещено» без единого скана QR.
//
// Статус attended ставит только успешный check-in
// (server/checkin/checkin.service.ts), поэтому здесь остаётся одна проверка.

export function computedIsAttended(booking: Booking): boolean {
  return isBookingAttended(booking);
}
