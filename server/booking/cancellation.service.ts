// Отмена брони зрителем.
//
// Бизнес-правила владельца проекта:
//   paid      — нельзя (оплата окончательна, автовозвратов нет)
//   attended  — нельзя
//   cancelled — повторно нельзя
//   иначе     — можно, пока спектакль не начался
//
// Сами правила лежат в shared/domain/bookingRules (чистая функция canUserCancel),
// здесь только их применение к документу Firestore внутри транзакции.

import { FieldValue } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { canUserCancel, isValidCancelReason } from '../../shared/domain/bookingRules.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import { SHOWS, showStartUtcMs } from '../../shared/catalog/shows.js';
import { MAX_CANCEL_COMMENT_LEN } from '../../shared/contracts/limits.js';
import { db, BOOKINGS, SHOW_COUNTERS } from './booking.repository.js';

// Человекочитаемые отказы. Ключи совпадают с CancelRefusal.
const REFUSAL_MESSAGES: Record<string, string> = {
  already_cancelled: 'Бронь уже отменена',
  already_attended:  'Бронь уже отмечена как посещённая',
  already_paid:      'Оплаченную бронь может отменить только администратор театра',
  show_started:      'Спектакль уже начался — отмена недоступна',
};

export interface CancelBookingInput {
  uid:       string;
  bookingId: unknown;
  reason:    unknown;
  comment:   unknown;
}

export async function cancelBookingByUser(input: CancelBookingInput): Promise<{ ok: true; bookingId: string; status: 'cancelled' }> {
  const { uid } = input;

  if (typeof input.bookingId !== 'string' || !input.bookingId.trim()) {
    throw badRequest('bookingId is required');
  }
  if (!isValidCancelReason(input.reason)) {
    throw badRequest('Invalid cancellation reason');
  }

  const bookingId = input.bookingId;
  const reason    = input.reason;
  const comment   = typeof input.comment === 'string'
    ? input.comment.trim().slice(0, MAX_CANCEL_COMMENT_LEN)
    : '';

  const database = db();
  const ref = database.collection(BOOKINGS).doc(bookingId);

  // Транзакция: между проверкой состояния и записью бронь не должна измениться
  // (например, администратор в этот же момент отмечает её оплаченной).
  const refusal = await database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    // Владение проверяем ДО любых подробностей, чтобы чужая бронь не «светилась»
    // разными кодами ответа.
    if (!snap.exists || (snap.data() as Record<string, unknown>).userId !== uid) {
      return { notFound: true as const };
    }

    const data = snap.data() as Record<string, unknown>;

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

    if (!decision.allowed) return { reason: decision.reason };

    // Касаемся счётчика спектакля: он служит точкой конфликта, поэтому отмена
    // и параллельное бронирование того же спектакля не разъезжаются.
    if (typeof data.showId === 'string' && data.showId) {
      tx.set(
        database.collection(SHOW_COUNTERS).doc(data.showId),
        { updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    tx.update(ref, {
      status:       'cancelled',
      cancelledBy:  'user',
      cancelReason: reason,
      ...(comment ? { cancelComment: comment } : {}),
      cancelledAt:  FieldValue.serverTimestamp(),
      updatedAt:    FieldValue.serverTimestamp(),
    });

    return null;
  });

  if (refusal && 'notFound' in refusal) throw notFound('Booking not found');
  if (refusal?.reason) {
    throw conflict(REFUSAL_MESSAGES[refusal.reason] ?? 'Отмена недоступна', refusal.reason);
  }

  return { ok: true, bookingId, status: 'cancelled' };
}
