// Аннулирование неоплаченных банковских переводов.
//
// По бизнес-правилу у зрителя есть 24 часа на перевод, после чего бронь должна
// стать expired/cancelled и перестать занимать место. Раньше это происходило,
// только если кто-нибудь откроет личный кабинет или админку: пока никто
// не заходил, протухшая бронь держала место сколько угодно.

import { FieldValue } from 'firebase-admin/firestore';
import { isTransferOverdue } from '../../shared/domain/bookingRules.js';
import { db, bookingsRef, SHOW_COUNTERS } from '../booking/booking.repository.js';
import { timestampToMs } from '../booking/booking.types.js';

// За один запуск обрабатываем ограниченное число броней: если их накопилось
// больше, остаток разберёт следующий запуск по расписанию.
const MAX_PER_RUN = 400;

export interface ExpirationResult {
  expired: number;
  shows:   string[];
}

function overdue(data: Record<string, unknown>, nowMs: number): boolean {
  return isTransferOverdue({
    status:             String(data.status ?? ''),
    paymentStatus:      String(data.paymentStatus ?? ''),
    paymentExpiresAtMs: timestampToMs(data.paymentExpiresAt) ?? null,
  }, nowMs);
}

export async function expireOverdueTransfers(nowMs: number = Date.now()): Promise<ExpirationResult> {
  const database = db();

  const snap = await bookingsRef()
    .where('paymentStatus', '==', 'awaiting_transfer')
    .limit(MAX_PER_RUN)
    .get();

  const candidates = snap.docs.filter(d => overdue(d.data() as Record<string, unknown>, nowMs));
  const touchedShows = new Set<string>();
  let expired = 0;

  // Каждая бронь — отдельной транзакцией с повторной проверкой состояния.
  //
  // Раньше здесь была пакетная запись по результатам запроса: между запросом и
  // коммитом администратор мог отметить перевод полученным, и cron молча
  // перезаписывал оплаченную бронь в expired/cancelled — деньги получены,
  // а билет аннулирован. Batch не умеет «обнови, только если не изменилось»,
  // транзакция — умеет. Броней в день единицы, лишние чтения не важны.
  for (const d of candidates) {
    const showId = await database.runTransaction(async (tx) => {
      const fresh = await tx.get(d.ref);
      const data  = fresh.data() as Record<string, unknown> | undefined;
      if (!fresh.exists || !data || !overdue(data, nowMs)) return null;

      const id = String(data.showId ?? '');
      // Счётчик спектакля — точка конфликта с параллельным бронированием.
      if (id) {
        tx.set(database.collection(SHOW_COUNTERS).doc(id),
          { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      tx.update(d.ref, {
        paymentStatus: 'expired',
        status:        'cancelled',
        expiredAt:     FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      });
      return id;
    });

    if (showId === null) continue;
    expired += 1;
    if (showId) touchedShows.add(showId);
  }

  return { expired, shows: [...touchedShows] };
}
