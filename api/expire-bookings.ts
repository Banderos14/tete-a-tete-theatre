// Vercel Cron — аннулирование неоплаченных банковских переводов.
//
// По бизнес-правилу у зрителя есть 24 часа на перевод, после чего бронь должна
// стать expired/cancelled и перестать занимать место. Раньше это происходило,
// только если кто-нибудь откроет личный кабинет или админку: пока никто не
// заходил, протухшая бронь держала место сколько угодно.
//
// Теперь протухание выполняется по расписанию (см. crons в vercel.json).
//
// Доступ: Vercel сам присылает Authorization: Bearer <CRON_SECRET>.
// Если переменная задана, запрос без неё отклоняется — endpoint не должен
// дёргаться посторонними.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, bearerToken } from './_lib/http.js';
import { isTransferOverdue } from './_lib/bookingRules.js';

// За один запуск обрабатываем ограниченное число броней: если их накопилось
// больше, остаток разберёт следующий запуск по расписанию.
const MAX_PER_RUN = 400;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' }, req);
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (secret && bearerToken(req) !== secret) {
    respond(res, 401, { error: 'Unauthorized' }, req);
    return;
  }

  const db = getFirestore(getAdminApp());
  const nowMs = Date.now();

  try {
    const snap = await db.collection('bookings')
      .where('paymentStatus', '==', 'awaiting_transfer')
      .limit(MAX_PER_RUN)
      .get();

    const overdue = snap.docs.filter(d => {
      const data = d.data() as Record<string, unknown>;
      const expiresAt = data.paymentExpiresAt as { toMillis?: () => number } | undefined;
      return isTransferOverdue({
        status:            String(data.status ?? ''),
        paymentStatus:     String(data.paymentStatus ?? ''),
        paymentExpiresAtMs: typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null,
      }, nowMs);
    });

    // Пишем порциями: лимит одного batch в Firestore — 500 операций.
    const BATCH_LIMIT = 450;
    const touchedShows = new Set<string>();

    for (let i = 0; i < overdue.length; i += BATCH_LIMIT) {
      const batch = db.batch();
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
      await db.collection('showCounters').doc(showId)
        .set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    console.log(`[expire-bookings] expired=${overdue.length} shows=${touchedShows.size}`);
    respond(res, 200, { ok: true, expired: overdue.length, shows: [...touchedShows] }, req);

  } catch (err) {
    console.error('[expire-bookings] failed:', err);
    respond(res, 500, { error: 'Failed to expire bookings' }, req);
  }
}
