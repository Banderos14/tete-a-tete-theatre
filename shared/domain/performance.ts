// Билет выписан на этот сеанс?
//
// У входа сотрудник выбирает спектакль (сеанс каталога), и проход разрешён
// только по билетам этого сеанса.
//
// Identity сеанса = showId + календарный день по Парижу. Отдельного id сеанса
// в данных нет: showId — это спектакль, и он уже переиспользовался при переносе
// («Романтика обреченности» 14.06 → 17.09 с тем же id). Поэтому одного showId
// мало. Но и точный момент начала сравнивать нельзя: исправление времени в
// каталоге (20:00 → 20:30) превращало уже проданные билеты в «другой
// спектакль». День — ровно та граница, которая нужна: у одного showId в
// каталоге один сеанс, и двух сеансов одного спектакля в один день не бывает.
//
//   тот же showId, тот же день, время поправили → свой билет;
//   тот же showId, другой день (перенос)        → чужой билет;
//   другой showId                               → чужой билет.
//
// Никаких временных окон: пропускать можно в любой момент, лишь бы билет
// был на тот сеанс, на котором стоит сотрудник.

import { SHOWS, showStartUtcMs } from '../catalog/shows.js';
import { bookingOccurrenceStartUtcMs, parisDateKey, type BookingOccurrence } from './showTime.js';

/** Известен ли спектакль каталогу (для проверки showId из запроса). */
export function isKnownShow(showId: unknown): showId is string {
  return typeof showId === 'string' && Object.hasOwn(SHOWS, showId);
}

/** День сеанса брони (по Парижу) либо null, если момент не восстанавливается. */
export function bookingPerformanceDay(booking: BookingOccurrence): string | null {
  const start = bookingOccurrenceStartUtcMs(booking);
  return start === null ? null : parisDateKey(start);
}

export function isBookingForShow(booking: BookingOccurrence & { showId?: unknown }, showId: string): boolean {
  if (!isKnownShow(showId) || booking.showId !== showId) return false;
  const catalogStart = showStartUtcMs(SHOWS[showId]!);
  const bookedDay    = bookingPerformanceDay(booking);
  // Момент не восстанавливается (очень старая бронь без даты) — решает showId.
  if (catalogStart === null || bookedDay === null) return true;
  return parisDateKey(catalogStart) === bookedDay;
}
