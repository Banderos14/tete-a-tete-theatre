// Stripe Hosted Checkout для онлайн-брони.
//
// Порядок всегда один, и Stripe никогда не вызывается внутри транзакции
// Firestore (транзакции перезапускаются — сессий было бы несколько):
//
//   1. транзакция создания брони (booking.service) — awaiting_online,
//      места и скидка удержаны, временный hold paymentExpiresAt;
//   2. checkout.sessions.create с idempotency key checkout_<bookingId>;
//   3. транзакция: stripeCheckoutSessionId + фактический session.expires_at
//      в paymentExpiresAt — с этого момента срок холда задаёт Stripe.
//
// Ссылку на оплату клиент получает ТОЛЬКО после шага 3. Поэтому бронь без
// записанной сессии оплатить невозможно, и её можно протухать без Stripe.
//
// Цена в Stripe — booking.totalAmount, уже посчитанный сервером вместе со
// скидкой лояльности. Второго калькулятора цены здесь нет.

import type Stripe from 'stripe';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { ApiError, badRequest, conflict, notFound } from '../shared/errors.js';
import { db, BOOKINGS } from '../booking/booking.repository.js';
import { timestampToMs } from '../booking/booking.types.js';
import { publicSiteUrl } from '../email/ticketEmail.service.js';
import { getStripe } from './stripe.client.js';
import {
  ONLINE_CURRENCY, STRIPE_MIN_SESSION_TTL_MS, amountInCents, isSafeBookingId,
  sessionExpiresAtMs, sessionState, sessionViewOf, type SessionView,
} from './onlinePayment.js';
import { confirmOnlinePayment, expireBookingWithoutSession, expireOnlineBooking } from './onlinePayment.service.js';

export interface CheckoutLink {
  checkoutState:     'open' | 'paid' | 'processing';
  checkoutUrl?:      string;
  /** Срок удержания мест (мс UTC) — фактический expires_at сессии. */
  paymentExpiresAt?: number;
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export const paymentUnavailable = () =>
  new ApiError(502, 'Online payment is temporarily unavailable', 'payment_unavailable');
const checkoutExpired = () => conflict('Checkout session expired', 'checkout_expired');

export interface CheckoutSessionInput {
  bookingId:   string;
  totalAmount: number;
  showTitle:   string;
  showDate:    string;
  showTime:    string;
  priceInfo:   string;
  userEmail:   string;
  lang:        'RU' | 'FR';
  expiresAtMs: number;
  siteBase:    string;
}

/** Параметры сессии — чистая функция: одна строка на всю сумму брони. */
export function buildCheckoutSessionParams(input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const base = input.siteBase.replace(/\/+$/, '');
  const back = (state: 'success' | 'cancelled') =>
    `${base}/?checkout=${state}&booking=${encodeURIComponent(input.bookingId)}`;
  const name = [input.showTitle, `${input.showDate} ${input.showTime}`.trim()].filter(Boolean).join(' — ');

  return {
    mode: 'payment',
    line_items: [{
      quantity:   1,
      price_data: {
        currency:     ONLINE_CURRENCY,
        unit_amount:  amountInCents(input.totalAmount),
        product_data: {
          name: name || 'Théâtre Tête-à-Tête',
          ...(input.priceInfo ? { description: input.priceInfo.slice(0, 500) } : {}),
        },
      },
    }],
    client_reference_id: input.bookingId,
    metadata:            { bookingId: input.bookingId },
    payment_intent_data: { metadata: { bookingId: input.bookingId } },
    ...(EMAIL_RE.test(input.userEmail) ? { customer_email: input.userEmail } : {}),
    locale:      input.lang === 'FR' ? 'fr' : 'auto',
    expires_at:  Math.floor(input.expiresAtMs / 1000),
    success_url: back('success'),
    cancel_url:  back('cancelled'),
  };
}

async function readBooking(bookingId: string): Promise<Record<string, unknown> | null> {
  const snap = await db().collection(BOOKINGS).doc(bookingId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

async function retrieveSession(sessionId: string): Promise<SessionView> {
  try {
    return sessionViewOf(await getStripe().checkout.sessions.retrieve(sessionId));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[checkout] session retrieve failed', sessionId, err);
    throw paymentUnavailable();
  }
}

/** Ссылка по уже созданной сессии; заодно сверяет бронь с состоянием Stripe. */
async function linkForSession(sessionId: string): Promise<CheckoutLink> {
  const session = await retrieveSession(sessionId);
  switch (sessionState(session)) {
    case 'open':
      return { checkoutState: 'open', checkoutUrl: session.url ?? undefined, paymentExpiresAt: session.expiresAtMs };
    case 'paid':
      await confirmOnlinePayment(session);
      return { checkoutState: 'paid' };
    case 'processing':
      return { checkoutState: 'processing' };
    case 'expired':
      await expireOnlineBooking(session, 'session_expired');
      throw checkoutExpired();
  }
}

/** Бестолковую сессию закрываем по возможности: оплатить её не должен никто. */
async function expireSessionQuietly(sessionId: string): Promise<void> {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch (err) {
    console.warn('[checkout] could not expire orphan session', sessionId, err);
  }
}

function isIdempotencyInProgress(err: unknown): boolean {
  const e = err as { type?: string; statusCode?: number } | null;
  return e?.type === 'StripeIdempotencyError' || e?.statusCode === 409;
}

/**
 * Открытая ссылка на оплату онлайн-брони: создаёт сессию, если её ещё нет,
 * иначе возвращает существующую. Повторный вызов безопасен.
 */
export async function openCheckoutForBooking(bookingId: string, nowMs: number = Date.now()): Promise<CheckoutLink> {
  const data = await readBooking(bookingId);
  if (!data) throw notFound('Booking not found', 'not_found');
  if (data.paymentMethod !== 'online') throw badRequest('Booking is not an online payment', 'not_online');
  if (data.paymentStatus === 'paid') return { checkoutState: 'paid' };
  if (data.paymentStatus !== 'awaiting_online' || data.status === 'cancelled') throw checkoutExpired();

  if (typeof data.stripeCheckoutSessionId === 'string' && data.stripeCheckoutSessionId) {
    return linkForSession(data.stripeCheckoutSessionId);
  }

  // Срок сессии выводится из hold брони, а не из «сейчас»: повтор запроса
  // даёт те же параметры, и Stripe по idempotency key вернёт ту же сессию.
  const holdMs      = timestampToMs(data.paymentExpiresAt);
  const expiresAtMs = typeof holdMs === 'number' ? sessionExpiresAtMs(holdMs) : NaN;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs - nowMs < STRIPE_MIN_SESSION_TTL_MS) {
    // Окно создания прошло, а сессии нет: первая попытка оборвалась.
    // Ссылку никто не получал — бронь можно освободить сразу.
    await expireBookingWithoutSession(bookingId, 'checkout_not_created');
    throw checkoutExpired();
  }

  const params = buildCheckoutSessionParams({
    bookingId,
    totalAmount: Number(data.totalAmount),
    showTitle:   String(data.showTitle ?? ''),
    showDate:    String(data.showDate ?? ''),
    showTime:    String(data.showTime ?? ''),
    priceInfo:   String(data.priceInfo ?? ''),
    userEmail:   String(data.userEmail ?? ''),
    lang:        data.lang === 'FR' ? 'FR' : 'RU',
    expiresAtMs,
    siteBase:    publicSiteUrl(),
  });

  let session: SessionView;
  try {
    session = sessionViewOf(await getStripe().checkout.sessions.create(params, {
      idempotencyKey: `checkout_${bookingId}`,
    }));
  } catch (err) {
    if (isIdempotencyInProgress(err)) {
      throw conflict('Checkout is being created, retry shortly', 'checkout_in_progress');
    }
    // Сессии нет (или она недоступна клиенту) — место и скидку не держим.
    console.error('[checkout] session create failed', bookingId, err);
    await expireBookingWithoutSession(bookingId, 'checkout_failed')
      .catch(e => console.error('[checkout] release after failure failed', bookingId, e));
    throw err instanceof ApiError ? err : paymentUnavailable();
  }

  // Шаг 3: записать сессию. Только после этого клиент получит ссылку.
  const database = db();
  const ref      = database.collection(BOOKINGS).doc(bookingId);
  let stored: boolean;
  try {
    stored = await database.runTransaction(async (tx) => {
      const snap  = await tx.get(ref);
      const fresh = snap.data() as Record<string, unknown> | undefined;
      if (!snap.exists || !fresh) return false;
      if (fresh.paymentStatus !== 'awaiting_online' || fresh.status === 'cancelled') return false;
      if (fresh.stripeCheckoutSessionId && fresh.stripeCheckoutSessionId !== session.id) return false;
      tx.update(ref, {
        stripeCheckoutSessionId: session.id,
        paymentExpiresAt:        Timestamp.fromMillis(session.expiresAtMs),
        updatedAt:               FieldValue.serverTimestamp(),
      });
      return true;
    });
  } catch (err) {
    console.error('[checkout] session persist failed', bookingId, session.id, err);
    await expireSessionQuietly(session.id);
    await expireBookingWithoutSession(bookingId, 'checkout_failed')
      .catch(e => console.error('[checkout] release after failure failed', bookingId, e));
    throw paymentUnavailable();
  }

  if (!stored) {
    // Пока создавалась сессия, бронь отменили или она протухла.
    await expireSessionQuietly(session.id);
    throw checkoutExpired();
  }
  if (!session.url) throw paymentUnavailable();
  return { checkoutState: 'open', checkoutUrl: session.url, paymentExpiresAt: session.expiresAtMs };
}

/** «Продолжить оплату» своей брони из кабинета. Чужая бронь — как несуществующая. */
export async function resumeCheckout(uid: string, rawBookingId: unknown): Promise<CheckoutLink & { ok: true; bookingId: string }> {
  const bookingId = typeof rawBookingId === 'string' ? rawBookingId.trim() : '';
  if (!isSafeBookingId(bookingId)) throw badRequest('Invalid bookingId');
  const data = await readBooking(bookingId);
  if (!data || data.userId !== uid) throw notFound('Booking not found', 'not_found');
  return { ok: true, bookingId, ...(await openCheckoutForBooking(bookingId)) };
}

/**
 * Перед отменой онлайн-брони, ожидающей оплаты, сессия Stripe закрывается.
 * После успешного expire оплатить её уже нельзя, и отмена не разойдётся
 * с деньгами. Если Stripe говорит, что оплата уже прошла, — отмены нет.
 *
 * ownerUid — для отмены зрителем: чужие брони не трогаем (отказ «не найдено»
 * даст сама отмена). null — отмена администратором.
 */
export async function releaseCheckoutBeforeCancel(rawBookingId: unknown, ownerUid: string | null): Promise<void> {
  const bookingId = typeof rawBookingId === 'string' ? rawBookingId.trim() : '';
  if (!isSafeBookingId(bookingId)) return;
  const data = await readBooking(bookingId);
  if (!data || (ownerUid !== null && data.userId !== ownerUid)) return;
  if (data.paymentMethod !== 'online' || data.paymentStatus !== 'awaiting_online') return;
  const sessionId = typeof data.stripeCheckoutSessionId === 'string' ? data.stripeCheckoutSessionId : '';
  // Без сессии ссылки ни у кого нет. Если создание ещё идёт, шаг 3 увидит
  // отменённую бронь и сам закроет сессию.
  if (!sessionId) return;

  try {
    await getStripe().checkout.sessions.expire(sessionId);
    return;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Не удалось закрыть: сессия могла уже завершиться — выясняем у Stripe.
    const session = await retrieveSession(sessionId);
    const state   = sessionState(session);
    if (state === 'expired') return;
    if (state === 'paid') {
      await confirmOnlinePayment(session);
      throw conflict('Booking is already paid', 'already_paid');
    }
    if (state === 'processing') throw conflict('Payment is being processed', 'payment_processing');
    console.error('[checkout] could not expire open session', sessionId, err);
    throw paymentUnavailable();
  }
}
