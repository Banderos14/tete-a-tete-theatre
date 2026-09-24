// Страховочная сверка онлайн-броней — вызывается тем же cron, что протухание переводов.
//
// Основной сигнал — webhook (checkout.session.completed / expired). Но доставка
// может сорваться: Firestore был недоступен, а Stripe исчерпал повторы
// (в Sandbox всего 3 попытки за несколько часов). Тогда бронь зависает в
// awaiting_online и держит места.
//
// Правило: срок сам по себе НЕ означает «не оплачено». Перед протуханием
// каждая бронь сверяется со Stripe:
//   complete + paid    → подтвердить оплату (как webhook);
//   open               → закрыть сессию, затем протухнуть бронь;
//   expired            → протухнуть бронь;
//   complete + unpaid  → отложенный метод оплаты ещё идёт — не трогать.
// Бронь без записанной сессии оплатить было нельзя (ссылка выдаётся только
// после записи id) — она протухает без обращения к Stripe.

import { isPaymentOverdue } from '../../shared/domain/bookingRules.js';
import { ApiError } from '../shared/errors.js';
import { bookingsRef } from '../booking/booking.repository.js';
import { timestampToMs } from '../booking/booking.types.js';
import { getStripe } from './stripe.client.js';
import { refundViewOf, sessionState, sessionViewOf, type SessionView } from './onlinePayment.js';
import { reconcileRefund } from './refundSync.service.js';
import { confirmOnlinePayment, expireBookingWithoutSession, expireOnlineBooking } from './onlinePayment.service.js';

/** Сколько ждать webhook после срока сессии, прежде чем сверяться самим. */
export const RECONCILE_GRACE_MS = 60 * 60 * 1000;
const MAX_PER_RUN = 200;

export interface OnlineReconcileResult {
  checked:  number;
  paid:     number;
  expired:  number;
  skipped:  number;
  errors:   number;
  /** Stripe не настроен в этом окружении — сверка не выполнялась. */
  disabled?: true;
}

type Stripeish = ReturnType<typeof getStripe>;

async function closeAndRead(stripe: Stripeish, sessionId: string): Promise<SessionView> {
  try {
    return sessionViewOf(await stripe.checkout.sessions.expire(sessionId));
  } catch {
    // Закрыть не вышло: сессия уже завершилась — берём её фактическое состояние.
    return sessionViewOf(await stripe.checkout.sessions.retrieve(sessionId));
  }
}

export async function reconcileOnlineBookings(nowMs: number = Date.now()): Promise<OnlineReconcileResult> {
  const result: OnlineReconcileResult = { checked: 0, paid: 0, expired: 0, skipped: 0, errors: 0 };

  let stripe: Stripeish;
  try {
    stripe = getStripe();
  } catch (err) {
    if (err instanceof ApiError) return { ...result, disabled: true };
    throw err;
  }

  const snap = await bookingsRef()
    .where('paymentStatus', '==', 'awaiting_online')
    .limit(MAX_PER_RUN)
    .get();

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const overdue = isPaymentOverdue({
      status:             String(data.status ?? ''),
      paymentStatus:      String(data.paymentStatus ?? ''),
      paymentExpiresAtMs: timestampToMs(data.paymentExpiresAt) ?? null,
    }, nowMs - RECONCILE_GRACE_MS);
    if (!overdue) continue;
    result.checked += 1;

    try {
      const sessionId = typeof data.stripeCheckoutSessionId === 'string' ? data.stripeCheckoutSessionId : '';
      if (!sessionId) {
        if (await expireBookingWithoutSession(d.id, 'checkout_not_created')) result.expired += 1;
        else result.skipped += 1;
        continue;
      }

      let session = sessionViewOf(await stripe.checkout.sessions.retrieve(sessionId));
      if (sessionState(session) === 'open') session = await closeAndRead(stripe, sessionId);

      switch (sessionState(session)) {
        case 'paid': {
          const r = await confirmOnlinePayment(session);
          if (r.outcome === 'confirm') result.paid += 1; else result.skipped += 1;
          break;
        }
        case 'expired': {
          const r = await expireOnlineBooking(session, 'reconcile_expired');
          if (r.outcome === 'expired') result.expired += 1; else result.skipped += 1;
          break;
        }
        default:
          // processing (отложенная оплата) или сессию не удалось закрыть — ждём.
          result.skipped += 1;
      }
    } catch (err) {
      // Одна сломанная бронь не останавливает сверку остальных.
      result.errors += 1;
      console.error('[reconcile] online booking check failed', d.id, err);
    }
  }

  return result;
}

// ── Возвраты: страховка на случай потерянных refund.* событий ────────────────
//
// Возвраты делает администратор в Stripe Dashboard, а бронь узнаёт о них из
// webhook. Если событие потерялось (в Sandbox — всего 3 попытки доставки),
// бронь осталась бы «оплаченной» или «возврат обрабатывается» навсегда.
//
// Всю историю платежей не опрашиваем. Два узких прохода:
//   1) ОДИН список возвратов Stripe за последние дни — ловит потерянные
//      refund.created / refund.updated / refund.failed;
//   2) брони, где возврат завис в pending дольше этого окна, — точечно по id.
// Каждый возврат применяется тем же reconcileRefund, что и webhook:
// идемпотентно, конечные состояния не откатываются, Stripe — источник правды.

/** Окно списка недавних возвратов: cron раз в сутки, запас на пропущенный запуск. */
export const REFUND_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_REFUNDS_PER_RUN = 300;

export interface RefundReconcileResult {
  checked:  number;
  recorded: number;
  errors:   number;
  disabled?: true;
}

export async function reconcileRefunds(nowMs: number = Date.now()): Promise<RefundReconcileResult> {
  const result: RefundReconcileResult = { checked: 0, recorded: 0, errors: 0 };

  let stripe: Stripeish;
  try {
    stripe = getStripe();
  } catch (err) {
    if (err instanceof ApiError) return { ...result, disabled: true };
    throw err;
  }

  const seen = new Set<string>();
  const apply = async (refund: Parameters<typeof refundViewOf>[0]) => {
    seen.add(refund.id);
    result.checked += 1;
    try {
      const r = await reconcileRefund(refundViewOf(refund));
      if (r.outcome === 'recorded') result.recorded += 1;
    } catch (err) {
      result.errors += 1;
      console.error('[reconcile] refund sync failed', refund.id, err);
    }
  };

  // 1) Недавние возвраты — одним списком (автопагинация SDK, с потолком).
  const since = Math.floor((nowMs - REFUND_LOOKBACK_MS) / 1000);
  for await (const refund of stripe.refunds.list({ created: { gte: since }, limit: 100 })) {
    if (result.checked >= MAX_REFUNDS_PER_RUN) break;
    await apply(refund);
  }

  // 2) Брони, где возврат завис в pending дольше окна: точечно по id возврата.
  const pending = await bookingsRef().where('refund.status', '==', 'pending').limit(100).get();
  for (const d of pending.docs) {
    const refundId = String(((d.data() as Record<string, unknown>).refund as { id?: unknown } | undefined)?.id ?? '');
    if (!refundId || seen.has(refundId)) continue;
    try {
      await apply(await stripe.refunds.retrieve(refundId));
    } catch (err) {
      result.errors += 1;
      console.error('[reconcile] refund retrieve failed', d.id, err);
    }
  }

  return result;
}
