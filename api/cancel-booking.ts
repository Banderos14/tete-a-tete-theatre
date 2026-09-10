// Vercel Serverless Function — отмена брони зрителем.
//
// Раньше клиент писал отмену напрямую в Firestore, но правила безопасности
// такую запись не пропускали (лишние поля не проходили affectedKeys().hasOnly),
// поэтому кнопка «Отменить бронь» не работала никогда. Теперь отмена — это
// серверная операция: правила Firestore пользовательских записей в bookings
// вообще не разрешают.
//
// Требуемые переменные окружения:
//   FIREBASE_SERVICE_ACCOUNT — сервисный аккаунт Firebase
// Опционально:
//   ALLOWED_ORIGIN

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, readBody, bearerToken } from './_lib/http.js';
import { canUserCancel, isValidCancelReason } from './_lib/bookingRules.js';
import { parseShowStartUtcMs } from './_lib/showTime.js';
import { SHOWS, showStartUtcMs } from './_lib/shows.js';

const MAX_CANCEL_COMMENT_LEN = 500;

// Человекочитаемые отказы. Ключи совпадают с CancelRefusal.
const REFUSAL_MESSAGES: Record<string, string> = {
  already_cancelled: 'Бронь уже отменена',
  already_attended:  'Бронь уже отмечена как посещённая',
  already_paid:      'Оплаченную бронь может отменить только администратор театра',
  show_started:      'Спектакль уже начался — отмена недоступна',
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  const idToken = bearerToken(req);
  if (!idToken) {
    respond(res, 401, { error: 'Authorization: Bearer <token> required' }, req);
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  const { bookingId, reason, comment } = body;

  if (typeof bookingId !== 'string' || !bookingId.trim()) {
    respond(res, 400, { error: 'bookingId is required' }, req);
    return;
  }
  if (!isValidCancelReason(reason)) {
    respond(res, 400, { error: 'Invalid cancellation reason' }, req);
    return;
  }
  const trimmedComment = typeof comment === 'string' ? comment.trim().slice(0, MAX_CANCEL_COMMENT_LEN) : '';

  const app = getAdminApp();

  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(idToken)).uid;
  } catch {
    respond(res, 401, { error: 'Invalid or expired token' }, req);
    return;
  }

  const db  = getFirestore(app);
  const ref = db.collection('bookings').doc(bookingId);

  try {
    // Транзакция: между проверкой состояния и записью бронь не должна измениться
    // (например, администратор в этот же момент отмечает её оплаченной).
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, code: 404, error: 'Booking not found' };

      const data = snap.data() as Record<string, unknown>;

      // Владение проверяем ДО любых подробностей, чтобы чужая бронь не «светилась»
      // разными кодами ответа.
      if (data.userId !== uid) {
        return { ok: false as const, code: 404, error: 'Booking not found' };
      }

      // Время начала: сначала из каталога (авторитетно), потом из полей брони.
      const catalogShow = typeof data.showId === 'string' ? SHOWS[data.showId] : undefined;
      const startMs = catalogShow
        ? showStartUtcMs(catalogShow)
        : parseShowStartUtcMs(String(data.showDate ?? ''), String(data.showTime ?? ''));

      const decision = canUserCancel(
        {
          status:        String(data.status ?? ''),
          paymentStatus: String(data.paymentStatus ?? ''),
          paymentMethod: String(data.paymentMethod ?? ''),
        },
        startMs,
      );

      if (!decision.allowed) {
        return {
          ok:     false as const,
          code:   409,
          error:  REFUSAL_MESSAGES[decision.reason ?? ''] ?? 'Отмена недоступна',
          reason: decision.reason,
        };
      }

      // Касаемся счётчика спектакля: он служит точкой конфликта, поэтому отмена
      // и параллельное бронирование того же спектакля не разъезжаются.
      if (typeof data.showId === 'string' && data.showId) {
        tx.set(
          db.collection('showCounters').doc(data.showId),
          { updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }

      tx.update(ref, {
        status:       'cancelled',
        cancelledBy:  'user',
        cancelReason: reason,
        ...(trimmedComment ? { cancelComment: trimmedComment } : {}),
        cancelledAt:  FieldValue.serverTimestamp(),
        updatedAt:    FieldValue.serverTimestamp(),
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      respond(res, result.code, { error: result.error, ...(result.reason ? { reason: result.reason } : {}) }, req);
      return;
    }

    respond(res, 200, { ok: true, bookingId, status: 'cancelled' }, req);

  } catch (err) {
    // Наружу — нейтральный текст; подробности только в серверный лог.
    console.error('[cancel-booking] transaction failed:', err);
    respond(res, 500, { error: 'Failed to cancel booking' }, req);
  }
}
