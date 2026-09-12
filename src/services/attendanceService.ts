import { isBookingAttended } from '../../shared/domain/bookingRules';
import { bookingOccurrenceStartUtcMs, showEndUtcMs } from '../../shared/domain/showTime';
import type { Booking } from '../types/booking';

// Модуль намеренно НЕ импортирует Firebase: это чистые правила, которыми
// пользуются и интерфейс, и расчёт лояльности, и тесты.
//
// ОПЛАТА НЕ ОЗНАЧАЕТ ПОСЕЩЕНИЕ — само правило и история регрессии описаны
// в shared/domain/bookingRules.ts, здесь только обёртка над ним. Статус
// attended ставит единственное место: server/checkin/checkin.service.ts.

/** Посещена ли бронь. Только факт прохода — оплата в решении не участвует. */
export function computedIsAttended(booking: Booking): boolean {
  return isBookingAttended(booking);
}

// Момент начала сеанса, на который выписана бронь. Правило одно на клиент и
// сервер (shared/domain/showTime.ts): сканер обязан считать «прошёл ли вечер»
// ровно так же, как кабинет, иначе билет «активен» в одном месте и просрочен
// в другом. Дата берётся из брони, не из каталога.
function bookingStartUtcMs(booking: Booking): number | null {
  return bookingOccurrenceStartUtcMs(booking as Parameters<typeof bookingOccurrenceStartUtcMs>[0]);
}

/**
 * Спектакль уже закончился.
 *
 * Отдельно от посещения: это про календарь, а не про то, пришёл ли зритель.
 * Нужно кабинету, чтобы билет прошедшего спектакля не висел в «активных»
 * вечно — раньше его убирал оттуда как раз вывод посещения из оплаты.
 */
export function isShowOver(booking: Booking, nowMs: number = Date.now()): boolean {
  const start = bookingStartUtcMs(booking);
  return start !== null && showEndUtcMs(start) < nowMs;
}
