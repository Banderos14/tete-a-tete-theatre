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
// В одном batch Firestore допускает не больше 500 операций.
const BATCH_LIMIT = 450;

export interface ExpirationResult {
  expired: number;
  shows:   string[];
}

export async function expireOverdueTransfers(nowMs: number = Date.now()): Promise<ExpirationResult> {
  const database = db();

  const snap = await bookingsRef()
    .where('paymentStatus', '==', 'awaiting_transfer')
    .limit(MAX_PER_RUN)
    .get();

  const overdue = snap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    return isTransferOverdue({
      status:             String(data.status ?? ''),
      paymentStatus:      String(data.paymentStatus ?? ''),
      paymentExpiresAtMs: timestampToMs(data.paymentExpiresAt) ?? null,
    }, nowMs);
  });

  const touchedShows = new Set<string>();

  for (let i = 0; i < overdue.length; i += BATCH_LIMIT) {
    const batch = database.batch();
    for (const d of overdue.slice(i, i + BATCH_LIMIT)) {
      batch.update(d.ref, {
        paymentStatus: 'expired',
        status:        'cancelled',
        expiredAt:     FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      });
      const showId = String((d.data() as Record<string, unknown>).showId ?? '');
      if (showId) touchedShows.add(showId);
    }
    await batch.commit();
  }

  // Трогаем счётчики затронутых спектаклей — они служат точкой конфликта
  // для параллельных транзакций бронирования.
  for (const showId of touchedShows) {
    await database.collection(SHOW_COUNTERS).doc(showId)
      .set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  return { expired: overdue.length, shows: [...touchedShows] };
}
