// Синхронизация возврата из Stripe в бронь (refund.created / refund.updated).
//
// Первый релиз (Phase 5a) НЕ инициирует возвраты: здесь нет ни одного вызова
// Refund API. Администратор возвращает деньги в Stripe Dashboard, а этот
// сервис отражает результат: полный возврат отменяет бронь (место и скидка
// освобождаются), succeeded — paymentStatus refunded, неудачный возврат
// виден администратору, частичный — помечается как проблема.
//
// Бронь находится по stripePaymentIntentId, который записал webhook оплаты из
// подписанного события. Идентификаторам из запроса здесь неоткуда взяться.

import { FieldValue } from 'firebase-admin/firestore';
import { db, bookingsRef, BOOKINGS, SHOW_COUNTERS } from '../booking/booking.repository.js';
import { sendBookingEmail } from '../email/ticketEmail.service.js';
import { bookingViewOf, decideRefund, type RefundDecision, type RefundView } from './onlinePayment.js';

export interface RefundSyncOutcome {
  bookingId: string | null;
  outcome:   'recorded' | 'ignored' | 'not_found';
  reason?:   string;
  cancelled?: boolean;
}

export async function reconcileRefund(refund: RefundView): Promise<RefundSyncOutcome> {
  if (!refund.paymentIntentId) return { bookingId: null, outcome: 'ignored', reason: 'no_payment_intent' };

  const found = await bookingsRef()
    .where('stripePaymentIntentId', '==', refund.paymentIntentId)
    .limit(1)
    .get();
  if (found.empty) {
    console.warn('[stripe] refund for unknown payment', { refundId: refund.id, paymentIntent: refund.paymentIntentId });
    return { bookingId: null, outcome: 'not_found' };
  }

  const bookingId = found.docs[0]!.id;
  const database  = db();
  const ref       = database.collection(BOOKINGS).doc(bookingId);

  const decision = await database.runTransaction<RefundDecision | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    const d    = decideRefund(bookingViewOf(bookingId, data), refund);
    if (d.kind === 'ignore') return d;

    const update: Record<string, unknown> = {
      refund: { id: refund.id, status: d.status, amount: refund.amount / 100, updatedAtMs: Date.now() },
      updatedAt: FieldValue.serverTimestamp(),
    };
    const currentIssue = typeof data.paymentIssue === 'string' ? data.paymentIssue : null;
    if (!d.full && d.status !== 'failed') {
      update.paymentIssue        = 'partial_refund';
      update.paymentIssueDetails = { refundId: refund.id, amountCents: refund.amount, atMs: Date.now() };
    }
    if (d.status === 'failed' && !currentIssue) {
      // Возврат не прошёл (в том числе после succeeded): деньги у театра, а бронь
      // могла уже быть отменена. Ни место, ни билет автоматически не
      // возвращаются — нужна ручная проверка, и админка должна это видеть.
      update.paymentIssue        = 'refund_failed';
      update.paymentIssueDetails = {
        refundId: refund.id, amountCents: refund.amount, afterSucceeded: d.revertRefunded, atMs: Date.now(),
      };
    }
    if (d.refunded && (currentIssue === 'refund_failed' || currentIssue === 'paid_after_cancel')) {
      // Полный возврат прошёл — деньги у зрителя, проблема закрыта. След — в paymentIssueResolved.
      update.paymentIssue         = FieldValue.delete();
      update.paymentIssueDetails  = FieldValue.delete();
      update.paymentIssueResolved = { issue: currentIssue, via: 'refund', refundId: refund.id, atMs: Date.now() };
    }
    if (d.cancel) {
      update.status       = 'cancelled';
      update.cancelledBy  = 'admin';
      update.cancelledVia = 'stripe_refund';
      update.cancelledAt  = FieldValue.serverTimestamp();
      const showId = String(data.showId ?? '');
      // Точка конфликта с параллельным бронированием — освобождённое место видно сразу.
      if (showId) {
        tx.set(database.collection(SHOW_COUNTERS).doc(showId),
          { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    if (d.refunded) {
      update.paymentStatus = 'refunded';
      update.refundedAt    = FieldValue.serverTimestamp();
    }
    if (d.revertRefunded) {
      // Возврат не состоялся: деньги у театра. Бронь остаётся отменённой.
      update.paymentStatus = 'paid';
      update.refundedAt    = FieldValue.delete();
    }
    tx.update(ref, update);
    return d;
  });

  if (decision === null) return { bookingId, outcome: 'not_found' };
  if (decision.kind === 'ignore') return { bookingId, outcome: 'ignored', reason: decision.reason };

  if (decision.status === 'failed') {
    console.error('[stripe] refund failed — needs manual attention', { bookingId, refundId: refund.id });
  }
  // Письмо об отмене — один раз (claim emails.cancelled), с пометкой о возврате.
  if (decision.cancel) await sendBookingEmail(bookingId, 'cancelled');
  return { bookingId, outcome: 'recorded', cancelled: decision.cancel };
}
