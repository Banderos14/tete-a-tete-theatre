// Переходы онлайн-брони в Firestore — одни на webhook, сверку cron и Checkout.
//
// Каждый переход: прочитать бронь в транзакции → решение чистой функцией
// (onlinePayment.ts) → запись. Вызовы Stripe здесь НЕ делаются: сервис
// получает уже прочитанную сессию, поэтому транзакция может спокойно
// перезапускаться.

import { FieldValue } from 'firebase-admin/firestore';
import { db, BOOKINGS } from '../booking/booking.repository.js';
import { applyExpiry } from '../booking/expiry.js';
import { paidTransition } from '../checkin/checkin.service.js';
import { sendBookingEmail } from '../email/ticketEmail.service.js';
import {
  bookingViewOf, decidePayment, decideSessionExpiry, isSafeBookingId,
  type PaymentDecision, type SessionView,
} from './onlinePayment.js';

/** paidBy для оплат, подтверждённых Stripe (а не администратором). */
export const STRIPE_PAYER = 'stripe';

export interface PaymentOutcome {
  bookingId: string | null;
  outcome:   PaymentDecision['kind'] | 'not_found';
}

/**
 * Stripe сообщил, что сессия оплачена. Идемпотентно: повтор того же события —
 * no-op, письмо «Оплата получена» защищено claim'ом emails.paid.
 */
export async function confirmOnlinePayment(session: SessionView): Promise<PaymentOutcome> {
  const bookingId = session.bookingId;
  if (!isSafeBookingId(bookingId)) return { bookingId: null, outcome: 'foreign' };

  const database = db();
  const ref      = database.collection(BOOKINGS).doc(bookingId);

  const decision = await database.runTransaction<PaymentDecision | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    const d    = decidePayment(bookingViewOf(bookingId, data), session);

    const stripeIds = {
      stripeCheckoutSessionId: session.id,
      ...(session.paymentIntentId ? { stripePaymentIntentId: session.paymentIntentId } : {}),
    };

    if (d.kind === 'confirm') {
      // Тот же набор полей, что у оплаты на входе: одна машина состояний.
      tx.update(ref, { ...paidTransition(STRIPE_PAYER), ...stripeIds });
    } else if (d.kind === 'paid_after_cancel') {
      // Деньги получены, а бронь уже не действует. Факт оплаты фиксируем,
      // бронь НЕ воскрешаем (место могли продать) — решает администратор.
      tx.update(ref, {
        ...stripeIds,
        paymentStatus:       'paid',
        paidAt:              FieldValue.serverTimestamp(),
        paidBy:              STRIPE_PAYER,
        paymentIssue:        'paid_after_cancel',
        paymentIssueDetails: {
          sessionId: session.id, paymentIntentId: session.paymentIntentId,
          amountTotal: session.amountTotal, currency: session.currency, atMs: Date.now(),
        },
        updatedAt:           FieldValue.serverTimestamp(),
      });
    } else if (d.kind === 'amount_mismatch') {
      // Не подтверждаем, но и не теряем: всё, что известно о платеже, — в бронь.
      tx.update(ref, {
        ...stripeIds,
        paymentIssue:        'amount_mismatch',
        paymentIssueDetails: { ...d.details, atMs: Date.now() },
        updatedAt:           FieldValue.serverTimestamp(),
      });
    }
    return d;
  });

  if (decision === null) {
    console.error('[stripe] paid session for unknown booking', { sessionId: session.id, bookingId });
    return { bookingId, outcome: 'not_found' };
  }
  if (decision.kind === 'amount_mismatch') {
    console.error('[stripe] amount/currency mismatch — booking NOT marked paid', { bookingId, ...decision.details });
  }
  if (decision.kind === 'paid_after_cancel') {
    console.error('[stripe] payment received for cancelled/expired booking', { bookingId, sessionId: session.id });
  }
  if (decision.kind === 'foreign') {
    console.warn('[stripe] session does not belong to booking', { bookingId, sessionId: session.id });
  }

  // Письмо-билет — после записи и на каждой доставке события: claim в
  // emails.paid не даст второго письма, а неудачное прошлое письмо дошлёт.
  if (decision.kind === 'confirm' || decision.kind === 'duplicate') {
    await sendBookingEmail(bookingId, 'paid');
  }
  return { bookingId, outcome: decision.kind };
}

export interface ExpiryOutcome {
  bookingId: string | null;
  outcome:   'expired' | 'noop' | 'foreign' | 'not_found';
}

/**
 * Stripe подтвердил, что сессия не оплачена (истекла или отложенная оплата
 * не прошла): бронь протухает, место и скидка возвращаются.
 */
export async function expireOnlineBooking(session: SessionView, reason: string): Promise<ExpiryOutcome> {
  const bookingId = session.bookingId;
  if (!isSafeBookingId(bookingId)) return { bookingId: null, outcome: 'foreign' };

  const database = db();
  const ref      = database.collection(BOOKINGS).doc(bookingId);

  return database.runTransaction<ExpiryOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { bookingId, outcome: 'not_found' };
    const data = snap.data() as Record<string, unknown>;
    const d    = decideSessionExpiry(bookingViewOf(bookingId, data), session);
    if (d.kind === 'foreign') return { bookingId, outcome: 'foreign' };
    if (d.kind === 'noop')    return { bookingId, outcome: 'noop' };
    applyExpiry(tx, database, ref, data, { expiredReason: reason });
    return { bookingId, outcome: 'expired' };
  });
}

/**
 * Протухание онлайн-брони, у которой так и не появилось сессии.
 *
 * Безопасно без Stripe: ссылку на оплату клиент получает только ПОСЛЕ записи
 * stripeCheckoutSessionId, так что бронь без него оплатить было нельзя.
 */
export async function expireBookingWithoutSession(bookingId: string, reason: string): Promise<boolean> {
  const database = db();
  const ref      = database.collection(BOOKINGS).doc(bookingId);
  return database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as Record<string, unknown>;
    if (data.paymentMethod !== 'online' || data.paymentStatus !== 'awaiting_online') return false;
    if (data.status === 'cancelled' || data.stripeCheckoutSessionId) return false;
    applyExpiry(tx, database, ref, data, { expiredReason: reason });
    return true;
  });
}
