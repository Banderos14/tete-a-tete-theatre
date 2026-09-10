// Vercel Serverless Function — проверка билета и отметка прохода.
//
// Раньше отметка делалась прямым updateDoc из браузера без транзакции и без
// предусловия: два администратора, сканирующие один код одновременно, оба
// получали «БИЛЕТ ДЕЙСТВИТЕЛЕН» и оба могли пропустить зрителя.
//
// Здесь одна атомарная операция: прочитать бронь -> проверить -> отметить.
// Второй одновременный запрос гарантированно получает already_attended.
//
// Требуемые переменные окружения:
//   FIREBASE_SERVICE_ACCOUNT

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, readBody, bearerToken } from './_lib/http.js';
import { parseShowStartUtcMs, showEndUtcMs } from './_lib/showTime.js';
import { SHOWS, showStartUtcMs } from './_lib/shows.js';

// Что делаем с билетом.
type Action = 'inspect' | 'mark_attended' | 'mark_paid';

const TICKET_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Насколько раньше начала спектакля билет уже принимается на входе.
const DOORS_OPEN_BEFORE_MS = 4 * 60 * 60 * 1000;
// Насколько поздно после окончания билет ещё считается «сегодняшним».
const GRACE_AFTER_END_MS   = 3 * 60 * 60 * 1000;

async function requireAdmin(idToken: string): Promise<string | null> {
  try {
    const app     = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const snap    = await getFirestore(app).collection('users').doc(decoded.uid).get();
    return snap.exists && snap.data()?.role === 'admin' ? decoded.uid : null;
  } catch {
    return null;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  const idToken = bearerToken(req);
  if (!idToken) { respond(res, 401, { error: 'Authorization required' }, req); return; }

  const adminUid = await requireAdmin(idToken);
  if (!adminUid) { respond(res, 403, { error: 'Admin only' }, req); return; }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  const ticketCode = typeof body.ticketCode === 'string' ? body.ticketCode.trim().toUpperCase() : '';
  const action     = (typeof body.action === 'string' ? body.action : 'inspect') as Action;

  if (!TICKET_CODE_RE.test(ticketCode)) {
    respond(res, 400, { error: 'Invalid ticket code format', reason: 'bad_code' }, req);
    return;
  }
  if (action !== 'inspect' && action !== 'mark_attended' && action !== 'mark_paid') {
    respond(res, 400, { error: 'Unknown action' }, req);
    return;
  }

  const db = getFirestore(getAdminApp());

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(
        db.collection('bookings').where('ticketCode', '==', ticketCode).limit(1),
      );
      if (snap.empty) return { ok: false as const, code: 404, error: 'Ticket not found', reason: 'not_found' };

      const doc  = snap.docs[0]!;
      const data = doc.data() as Record<string, unknown>;

      const status        = String(data.status ?? '');
      const paymentStatus = String(data.paymentStatus ?? '');
      const paymentMethod = String(data.paymentMethod ?? '');

      // Дата спектакля: билет прошлого месяца не должен считаться действительным
      // только потому, что код существует.
      const catalogShow = typeof data.showId === 'string' ? SHOWS[data.showId] : undefined;
      const startMs = catalogShow
        ? showStartUtcMs(catalogShow)
        : parseShowStartUtcMs(String(data.showDate ?? ''), String(data.showTime ?? ''));

      const nowMs = Date.now();
      const showRelevance: 'ok' | 'too_early' | 'too_late' | 'unknown' =
        startMs === null                                    ? 'unknown'
        : nowMs < startMs - DOORS_OPEN_BEFORE_MS            ? 'too_early'
        : nowMs > showEndUtcMs(startMs) + GRACE_AFTER_END_MS ? 'too_late'
        : 'ok';

      const info = {
        bookingId:     doc.id,
        ticketCode,
        showId:        String(data.showId ?? ''),
        showTitle:     String(data.showTitle ?? ''),
        showDate:      String(data.showDate ?? ''),
        showTime:      String(data.showTime ?? ''),
        userName:      String(data.userName ?? ''),
        // Нужны, чтобы страница проверки могла отправить то же письмо об оплате,
        // что и админка: поведение наличной оплаты должно совпадать.
        userEmail:     String(data.userEmail ?? ''),
        lang:          data.lang === 'FR' ? 'FR' : 'RU',
        ticketsCount:  typeof data.ticketsCount === 'number' ? data.ticketsCount : 1,
        totalAmount:   typeof data.totalAmount === 'number' ? data.totalAmount : 0,
        status, paymentStatus, paymentMethod, showRelevance,
      };

      if (action === 'inspect') return { ok: true as const, booking: info, changed: false };

      if (action === 'mark_attended') {
        if (status === 'attended') {
          return { ok: false as const, code: 409, error: 'Ticket already used', reason: 'already_attended', booking: info };
        }
        if (status === 'cancelled') {
          return { ok: false as const, code: 409, error: 'Booking cancelled', reason: 'cancelled', booking: info };
        }
        if (paymentStatus !== 'paid') {
          return { ok: false as const, code: 409, error: 'Ticket is not paid', reason: 'not_paid', booking: info };
        }
        tx.update(doc.ref, {
          status:       'attended',
          attendedAt:   FieldValue.serverTimestamp(),
          attendedBy:   adminUid,
          updatedAt:    FieldValue.serverTimestamp(),
        });
        return { ok: true as const, booking: { ...info, status: 'attended' }, changed: true };
      }

      // mark_paid — оплата наличными на входе
      if (status === 'cancelled') {
        return { ok: false as const, code: 409, error: 'Booking cancelled', reason: 'cancelled', booking: info };
      }
      if (paymentStatus === 'paid') {
        return { ok: false as const, code: 409, error: 'Already paid', reason: 'already_paid', booking: info };
      }
      tx.update(doc.ref, {
        paymentStatus: 'paid',
        status:        'confirmed',
        paidAt:        FieldValue.serverTimestamp(),
        paidBy:        adminUid,
        updatedAt:     FieldValue.serverTimestamp(),
      });
      return {
        ok: true as const,
        booking: { ...info, status: 'confirmed', paymentStatus: 'paid' },
        changed: true,
      };
    });

    if (!result.ok) {
      respond(res, result.code, {
        error: result.error, reason: result.reason,
        ...(result.booking ? { booking: result.booking } : {}),
      }, req);
      return;
    }

    respond(res, 200, { ok: true, changed: result.changed, booking: result.booking }, req);

  } catch (err) {
    console.error('[checkin-ticket] transaction failed:', err);
    respond(res, 500, { error: 'Check-in failed' }, req);
  }
}
