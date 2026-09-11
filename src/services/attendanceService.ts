import { isBookingAttended } from '../../shared/domain/bookingRules';
import { parseShowStartUtcMs, showEndUtcMs } from '../../shared/domain/showTime';
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

// Абсолютный момент начала спектакля (мс UTC).
// У новых броней он хранится полем showStartAt, у старых восстанавливается
// из строковых showDate/showTime как настенное время Europe/Paris.
function bookingStartUtcMs(booking: Booking): number | null {
  const raw = booking.showStartAt as unknown as
    { toMillis?: () => number; seconds?: number } | undefined;

  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?.seconds === 'number')    return raw.seconds * 1000;

  return parseShowStartUtcMs(booking.showDate, booking.showTime);
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
