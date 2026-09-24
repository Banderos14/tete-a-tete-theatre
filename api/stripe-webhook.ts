// Vercel Serverless Function — POST /api/stripe-webhook.
//
// Webhook Stripe: единственный источник правды об онлайн-оплате. Тело
// читается сырым (Buffer) — подпись Stripe считается по исходным байтам,
// поэтому req.body здесь не трогаем.
//
// Fail closed: без STRIPE_WEBHOOK_SECRET или с неверной подписью — 400,
// ни одна бронь не меняется. Сбой Firestore — 500, Stripe повторит доставку.
//
// Бизнес-логика — в server/payments/webhook.service.ts.
// Переменные окружения: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FIREBASE_SERVICE_ACCOUNT.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readRawBody } from '../server/shared/http.js';
import { errorResponse } from '../server/shared/errors.js';
import { handleStripeWebhook, WEBHOOK_MAX_BODY_BYTES } from '../server/payments/webhook.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stripe шлёт только POST; OPTIONS отвечает как все endpoint'ы проекта (браузер сюда не ходит).
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  try {
    const raw    = await readRawBody(req, WEBHOOK_MAX_BODY_BYTES);
    const result = await handleStripeWebhook(raw, req.headers['stripe-signature']);
    console.log(`[stripe-webhook] ${result.type} → ${result.outcome}`, result.bookingId ?? '');
    respond(res, 200, result);
  } catch (err) {
    const { status, body } = errorResponse(err, 'Stripe webhook processing failed');
    if (status >= 500) console.error('[stripe-webhook]', err);
    else console.warn('[stripe-webhook] rejected', status, body.reason ?? body.error);
    respond(res, status, body);
  }
}
