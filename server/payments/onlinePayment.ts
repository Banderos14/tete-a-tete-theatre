// Правила онлайн-оплаты — чистые функции без Firestore и сети.
//
// Сервисы (checkout, webhook, сверка cron) читают бронь и объект Stripe,
// переводят их сюда в простые «виды» и применяют вердикт внутри транзакции.
// Поэтому каждое решение — «подтвердить», «дубль», «чужая сессия», «сумма не
// совпала» — проверяется юнит-тестом без Stripe и без базы.

import type Stripe from 'stripe';

export const ONLINE_CURRENCY = 'eur';

/**
 * Временный hold брони до создания сессии. Заведомо длиннее сессии: нужен
 * только на случай, если сессия так и не создастся.
 */
export const ONLINE_HOLD_BEFORE_SESSION_MS = 35 * 60 * 1000;
/** Срок сессии Checkout: минимум Stripe — 30 минут, плюс минута запаса на сеть и часы. */
export const CHECKOUT_SESSION_TTL_MS = 31 * 60 * 1000;
/** Минимальный expires_at, который принимает Stripe, с запасом на сетевую задержку. */
export const STRIPE_MIN_SESSION_TTL_MS = 30 * 60 * 1000 + 15 * 1000;

const SAFE_DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Сумма брони в центах — то, что должен списать Stripe. */
export function amountInCents(totalAmount: number): number {
  return Math.round(totalAmount * 100);
}

/** Момент, до которого сессия создаётся: выводится из hold брони, поэтому повтор даёт те же параметры. */
export function sessionExpiresAtMs(provisionalHoldMs: number): number {
  return provisionalHoldMs - (ONLINE_HOLD_BEFORE_SESSION_MS - CHECKOUT_SESSION_TTL_MS);
}

// ── Виды данных ─────────────────────────────────────────────────────────────

export interface OnlineBookingView {
  bookingId:               string;
  paymentMethod:           string;
  paymentStatus:           string;
  status:                  string;
  totalAmount:             number;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId:   string | null;
  paymentIssue:            string | null;
}

export function bookingViewOf(bookingId: string, d: Record<string, unknown>): OnlineBookingView {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    bookingId,
    paymentMethod:           String(d.paymentMethod ?? ''),
    paymentStatus:           String(d.paymentStatus ?? ''),
    status:                  String(d.status ?? ''),
    totalAmount:             typeof d.totalAmount === 'number' ? d.totalAmount : NaN,
    stripeCheckoutSessionId: str(d.stripeCheckoutSessionId),
    stripePaymentIntentId:   str(d.stripePaymentIntentId),
    paymentIssue:            str(d.paymentIssue),
  };
}

export interface SessionView {
  id:                string;
  /** Бронь из metadata.bookingId, иначе из client_reference_id. */
  bookingId:         string | null;
  clientReferenceId: string | null;
  metadataBookingId: string | null;
  status:            string | null;
  paymentStatus:     string;
  amountTotal:       number | null;
  currency:          string | null;
  paymentIntentId:   string | null;
  expiresAtMs:       number;
  url:               string | null;
  livemode:          boolean;
}

export function sessionViewOf(s: Stripe.Checkout.Session): SessionView {
  const meta = typeof s.metadata?.bookingId === 'string' && s.metadata.bookingId ? s.metadata.bookingId : null;
  const ref  = s.client_reference_id || null;
  const pi   = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
  return {
    id:                s.id,
    bookingId:         meta ?? ref,
    clientReferenceId: ref,
    metadataBookingId: meta,
    status:            s.status ?? null,
    paymentStatus:     s.payment_status,
    amountTotal:       s.amount_total,
    currency:          s.currency,
    paymentIntentId:   pi,
    expiresAtMs:       s.expires_at * 1000,
    url:               s.url,
    livemode:          s.livemode,
  };
}

export function isSafeBookingId(id: string | null): id is string {
  return typeof id === 'string' && SAFE_DOC_ID_RE.test(id);
}

/**
 * Принадлежит ли сессия брони. Метаданным одним не верим: если в брони уже
 * записан id сессии, решает только он. Пока не записан (обрыв между созданием
 * сессии и записью) — должны совпасть И client_reference_id, И metadata.
 */
export function sessionBelongsToBooking(b: OnlineBookingView, s: SessionView): boolean {
  if (b.paymentMethod !== 'online') return false;
  if (b.stripeCheckoutSessionId) return b.stripeCheckoutSessionId === s.id;
  return s.clientReferenceId === b.bookingId && s.metadataBookingId === b.bookingId;
}

// ── Оплата ──────────────────────────────────────────────────────────────────

export type PaymentDecision =
  | { kind: 'foreign' }
  | { kind: 'not_paid' }
  | { kind: 'duplicate' }
  | { kind: 'amount_mismatch'; details: Record<string, unknown> }
  | { kind: 'already_recorded' }
  | { kind: 'paid_after_cancel' }
  | { kind: 'confirm' };

/**
 * Что делать с сообщением Stripe «сессия оплачена».
 *
 * Порядок проверок важен: сначала принадлежность (чужая сессия ничего не
 * меняет), затем факт оплаты, затем дубль, затем сумма и валюта — и только
 * потом переход по состоянию брони.
 */
export function decidePayment(b: OnlineBookingView, s: SessionView): PaymentDecision {
  if (!sessionBelongsToBooking(b, s)) return { kind: 'foreign' };
  if (s.paymentStatus !== 'paid')     return { kind: 'not_paid' };

  // Тот же платёж уже учтён: оплачен или даже возвращён. Поздний повтор
  // события не должен ни второй раз подтверждать, ни затирать refunded.
  const samePayment = b.stripePaymentIntentId !== null
    && (s.paymentIntentId === null || b.stripePaymentIntentId === s.paymentIntentId);
  if (samePayment && (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded')) {
    return { kind: 'duplicate' };
  }

  const expected = amountInCents(b.totalAmount);
  if (!Number.isFinite(expected) || s.amountTotal !== expected || (s.currency ?? '').toLowerCase() !== ONLINE_CURRENCY) {
    if (b.paymentIssue === 'amount_mismatch') return { kind: 'already_recorded' };
    return {
      kind: 'amount_mismatch',
      details: {
        expectedAmountCents: Number.isFinite(expected) ? expected : null,
        expectedCurrency:    ONLINE_CURRENCY,
        amountTotal:         s.amountTotal,
        currency:            s.currency,
        sessionId:           s.id,
        paymentIntentId:     s.paymentIntentId,
      },
    };
  }

  if (b.paymentStatus === 'awaiting_online' && b.status !== 'cancelled') return { kind: 'confirm' };
  if (b.status === 'cancelled' || b.paymentStatus === 'expired') {
    return b.paymentIssue === 'paid_after_cancel' ? { kind: 'already_recorded' } : { kind: 'paid_after_cancel' };
  }
  // Оплачено другим PaymentIntent или неизвестное состояние — ничего не трогаем.
  return { kind: 'already_recorded' };
}

// ── Протухание ──────────────────────────────────────────────────────────────

export type ExpiryDecision = { kind: 'foreign' } | { kind: 'noop'; reason: string } | { kind: 'expire' };

/**
 * Протухать ли бронь по сессии, которая по данным Stripe не оплачена.
 * Только из awaiting_online: оплаченная, отменённая и уже протухшая бронь
 * остаётся как есть.
 */
export function decideSessionExpiry(b: OnlineBookingView, s: SessionView): ExpiryDecision {
  if (!sessionBelongsToBooking(b, s))          return { kind: 'foreign' };
  if (b.paymentStatus !== 'awaiting_online')   return { kind: 'noop', reason: b.paymentStatus };
  if (b.status === 'cancelled')                return { kind: 'noop', reason: 'cancelled' };
  return { kind: 'expire' };
}

/** Что говорит Stripe о сессии для сверки: оплачена, не оплачена или ещё идёт. */
export type SessionState = 'paid' | 'expired' | 'open' | 'processing';

export function sessionState(s: SessionView): SessionState {
  if (s.status === 'complete') return s.paymentStatus === 'paid' ? 'paid' : 'processing';
  if (s.status === 'expired')  return 'expired';
  return 'open';
}
