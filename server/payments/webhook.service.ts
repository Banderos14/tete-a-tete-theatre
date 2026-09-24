// Webhook Stripe — источник правды об оплате.
//
// Success-redirect ничего не подтверждает: зритель мог закрыть вкладку сразу
// после оплаты, а бронь всё равно станет оплаченной и письмо уйдёт отсюда.
//
// Ответы (их смысл важен для повторов Stripe):
//   400 — нет секрета, нет/неверная подпись, чужой livemode: повтор не поможет,
//         событие не обработано (fail closed);
//   500 — сбой Firestore или внутренняя ошибка: Stripe повторит доставку
//         (Sandbox — 3 попытки за несколько часов, live — до 3 суток);
//   200 — событие обработано, дубль или не нужно нам.
//
// Обработка идемпотентна по состоянию брони: повтор события ничего не меняет,
// письмо «Оплата получена» защищено claim'ом emails.paid.

import type Stripe from 'stripe';
import { badRequest, ApiError } from '../shared/errors.js';
import { getStripe, expectedLivemode } from './stripe.client.js';
import { refundViewOf, sessionViewOf } from './onlinePayment.js';
import { confirmOnlinePayment, expireOnlineBooking } from './onlinePayment.service.js';
import { reconcileRefund } from './refundSync.service.js';

/** События, на которые подписан endpoint в Stripe Dashboard. refund.failed не нужен: его покрывает refund.updated. */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'refund.created',
  'refund.updated',
] as const;

/** Событие Checkout Session с объектом — сессии всегда небольшие, но запас не помешает. */
export const WEBHOOK_MAX_BODY_BYTES = 512 * 1024;

export interface WebhookResult {
  received:   true;
  type:       string;
  outcome:    string;
  bookingId?: string | null;
}

export function verifyStripeEvent(raw: Buffer, signature: unknown): Stripe.Event {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  if (!secret) throw badRequest('Stripe webhook is not configured', 'webhook_not_configured');
  if (typeof signature !== 'string' || !signature) throw badRequest('Missing Stripe-Signature', 'invalid_signature');

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw badRequest('Invalid Stripe signature', 'invalid_signature');
  }
  // Событие test-режима не должно менять брони live-окружения и наоборот.
  if (event.livemode !== expectedLivemode()) throw badRequest('Livemode mismatch', 'livemode_mismatch');
  return event;
}

export async function handleStripeWebhook(raw: Buffer, signature: unknown): Promise<WebhookResult> {
  const event = verifyStripeEvent(raw, signature);
  const type  = event.type;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = sessionViewOf(event.data.object);
      // completed + unpaid — отложенный метод оплаты: ждём async_payment_*.
      if (session.paymentStatus !== 'paid') return { received: true, type, outcome: 'awaiting_async', bookingId: session.bookingId };
      const r = await confirmOnlinePayment(session);
      return { received: true, type, outcome: r.outcome, bookingId: r.bookingId };
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = sessionViewOf(event.data.object);
      if (session.paymentStatus === 'paid') {
        // Противоречивое событие: деньги важнее. Протухать оплаченное нельзя.
        const r = await confirmOnlinePayment(session);
        return { received: true, type, outcome: r.outcome, bookingId: r.bookingId };
      }
      const reason = type === 'checkout.session.expired' ? 'session_expired' : 'async_payment_failed';
      const r = await expireOnlineBooking(session, reason);
      return { received: true, type, outcome: r.outcome, bookingId: r.bookingId };
    }
    case 'refund.created':
    case 'refund.updated': {
      const r = await reconcileRefund(refundViewOf(event.data.object));
      return { received: true, type, outcome: r.reason ? `${r.outcome}:${r.reason}` : r.outcome, bookingId: r.bookingId };
    }
    default:
      return { received: true, type, outcome: 'ignored' };
  }
}
