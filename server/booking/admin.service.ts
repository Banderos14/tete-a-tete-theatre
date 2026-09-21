// Изменения брони администратором из таблицы: отмена и снятие оплаты.
//
// Раньше админка писала их в Firestore прямо из браузера. Теперь сервер сам
// читает бронь в транзакции и решает, допустим ли переход: клиент присылает
// только id брони и действие.

import { FieldValue } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { db, BOOKINGS, SHOW_COUNTERS } from './booking.repository.js';

const SAFE_DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function parseBookingId(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  // Идентификатор подставляется в путь документа — строка со слэшем адресовала бы другой документ.
  if (!SAFE_DOC_ID_RE.test(value)) throw badRequest('Invalid bookingId');
  return value;
}

export interface AdminChangeResult {
  ok:        true;
  bookingId: string;
  status:        string;
  paymentStatus: string;
}

/**
 * Отмена администратором. Посещённую бронь отменить нельзя — зритель уже в зале
 * (раньше устаревшая строка админки молча превращала прошедшего в «отменено»).
 * Оплаченную — можно: возврат денег театр делает вручную.
 */
export async function cancelBookingByAdmin(adminUid: string, rawId: unknown): Promise<AdminChangeResult> {
  const bookingId = parseBookingId(rawId);
  const database  = db();
  const ref       = database.collection(BOOKINGS).doc(bookingId);

  const outcome = await database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'missing' as const };
    const data = snap.data() as Record<string, unknown>;
    const status = String(data.status ?? '');
    if (status === 'cancelled') return { kind: 'refused' as const, reason: 'already_cancelled' };
    if (status === 'attended')  return { kind: 'refused' as const, reason: 'already_attended' };

    if (typeof data.showId === 'string' && data.showId) {
      // Точка конфликта с параллельным бронированием того же спектакля.
      tx.set(database.collection(SHOW_COUNTERS).doc(data.showId),
        { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.update(ref, {
      status:         'cancelled',
      cancelledBy:    'admin',
      cancelledByUid: adminUid,
      cancelledAt:    FieldValue.serverTimestamp(),
      updatedAt:      FieldValue.serverTimestamp(),
    });
    return { kind: 'done' as const, paymentStatus: String(data.paymentStatus ?? '') };
  });

  if (outcome.kind === 'missing') throw notFound('Booking not found', 'not_found');
  if (outcome.kind === 'refused') throw conflict('Booking cannot be cancelled', outcome.reason);
  return { ok: true, bookingId, status: 'cancelled', paymentStatus: outcome.paymentStatus };
}

/** Снять отметку об оплате (ошиблись кнопкой). После прохода — нельзя. */
export async function markUnpaidByAdmin(rawId: unknown): Promise<AdminChangeResult> {
  const bookingId = parseBookingId(rawId);
  const database  = db();
  const ref       = database.collection(BOOKINGS).doc(bookingId);

  const outcome = await database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'missing' as const };
    const data = snap.data() as Record<string, unknown>;
    if (data.paymentStatus !== 'paid') return { kind: 'refused' as const, reason: 'not_paid' };
    if (data.status === 'attended')   return { kind: 'refused' as const, reason: 'already_attended' };
    tx.update(ref, {
      paymentStatus: 'not_paid',
      paidAt:        FieldValue.delete(),
      paidBy:        FieldValue.delete(),
      updatedAt:     FieldValue.serverTimestamp(),
    });
    return { kind: 'done' as const, status: String(data.status ?? '') };
  });

  if (outcome.kind === 'missing') throw notFound('Booking not found', 'not_found');
  if (outcome.kind === 'refused') throw conflict('Payment cannot be reverted', outcome.reason);
  return { ok: true, bookingId, status: outcome.status, paymentStatus: 'not_paid' };
}
