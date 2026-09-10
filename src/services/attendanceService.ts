import { parseShowStartUtcMs } from '../../api/_lib/showTime';
import { isBookingAttended } from '../../api/_lib/bookingRules';
import type { Booking } from '../types/booking';

// Модуль намеренно НЕ импортирует Firebase: это чистые правила, которыми
// пользуются и интерфейс, и расчёт лояльности, и тесты. Запись статуса
// attended живёт в bookingService — её выполняет только админка.
//
// Время спектакля считается ОДНОЙ реализацией — общей с сервером (api/_lib/showTime).
//
// Раньше здесь была своя копия разбора «17 Май 2026», которая собирала дату
// локальным конструктором Date — то есть в таймзоне БРАУЗЕРА. Серверная копия
// делала то же самое в таймзоне процесса (на Vercel это UTC) и вдобавок прибавляла
// двухчасовой буфер прямо при сборке даты. В итоге один и тот же спектакль «заканчивался»
// в разное время у зрителя из Ниццы, зрителя из Москвы и у сервера, а переход на
// летнее/зимнее время сдвигал момент ещё раз.

// Абсолютный момент начала спектакля (мс UTC).
// У новых броней он хранится полем showStartAt, у старых восстанавливается
// из строковых showDate/showTime как настенное время Europe/Paris.
export function bookingStartUtcMs(booking: Booking): number | null {
  const raw = booking.showStartAt as unknown as
    { toMillis?: () => number; seconds?: number } | undefined;

  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number')    return raw.seconds * 1000;

  return parseShowStartUtcMs(booking.showDate, booking.showTime);
}

// Чистая проверка: считать ли бронь посещённой?
// Требует confirmed + paid + спектакль завершился (начало + 2 часа буфера).
export function shouldMarkAsAttended(booking: Booking, nowMs: number = Date.now()): boolean {
  if (booking.status === 'attended') return false; // уже отмечена — писать нечего
  return isBookingAttended(booking, bookingStartUtcMs(booking), nowMs);
}

// Вычисленный статус — используется в UI, чтобы сразу показать "посещено"
// без ожидания обновления Firestore.
export function computedIsAttended(booking: Booking, nowMs: number = Date.now()): boolean {
  return isBookingAttended(booking, bookingStartUtcMs(booking), nowMs);
}
