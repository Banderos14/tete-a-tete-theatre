// Остаток мест по спектаклям.
//
// Клиент физически не может посчитать занятость сам: правила Firestore не
// разрешают ему читать чужие брони. Ответ не содержит персональных данных —
// только числа. Авторитетная проверка вместимости всё равно происходит
// в транзакции создания брони.

import { sumOccupiedTickets } from '../../shared/domain/bookingRules.js';
import { SHOWS, THEATRE_CAPACITY } from '../../shared/catalog/shows.js';
import { isShowBookingEnabled } from '../../shared/catalog/salesMode.js';
import type { ShowAvailability } from '../../shared/contracts/booking.js';
import { bookingsRef } from '../booking/booking.repository.js';

export async function readShowAvailability(): Promise<Record<string, ShowAvailability>> {
  const showIds = Object.keys(SHOWS);

  const availability: Record<string, ShowAvailability> = {};
  for (const id of showIds) {
    availability[id] = {
      capacity: THEATRE_CAPACITY, sold: 0, remaining: THEATRE_CAPACITY,
      bookingEnabled: isShowBookingEnabled(id),
    };
  }

  // Запрос 'in' принимает не больше 30 значений, а с отдельными сеансами
  // новогодних постановок спектаклей в каталоге уже почти два десятка —
  // поэтому id идут пачками. Каждый сеанс считается отдельно: места разных
  // показов одной постановки не складываются.
  const IN_LIMIT = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < showIds.length; i += IN_LIMIT) chunks.push(showIds.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(chunks.map(ids => bookingsRef().where('showId', 'in', ids).get()));

  const byShow: Record<string, Array<{ status: string; paymentStatus: string; ticketsCount?: number; seatsCount?: number }>> = {};
  snaps.flatMap(snap => snap.docs).forEach((d) => {
    const data   = d.data() as Record<string, unknown>;
    const showId = String(data.showId ?? '');
    if (!availability[showId]) return;
    (byShow[showId] ??= []).push({
      status:        String(data.status ?? ''),
      paymentStatus: String(data.paymentStatus ?? ''),
      ticketsCount:  typeof data.ticketsCount === 'number' ? data.ticketsCount : undefined,
      seatsCount:    typeof data.seatsCount === 'number' ? data.seatsCount : undefined,
    });
  });

  for (const id of showIds) {
    const entry = availability[id]!;
    entry.sold = sumOccupiedTickets(byShow[id] ?? []);
    entry.remaining = Math.max(0, entry.capacity - entry.sold);
  }

  return availability;
}
