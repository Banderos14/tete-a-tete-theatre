// Доступ к коллекции bookings.
//
// Слой существует, чтобы сервисы говорили о бронях, а не о снимках Firestore:
// разворачивание Timestamp и формы документа живут только здесь.

import { getFirestore, type Firestore, type Transaction, type Query } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import { sumOccupiedTickets } from '../../shared/domain/bookingRules.js';
import { timestampToMs, type RawBooking } from './booking.types.js';

export const BOOKINGS = 'bookings';
export const SHOW_COUNTERS = 'showCounters';
export const LOYALTY_STATE = 'loyaltyState';
export const IDEMPOTENCY_KEYS = 'idempotencyKeys';

export function db(): Firestore {
  return getFirestore(getAdminApp());
}

export function bookingsRef() {
  return db().collection(BOOKINGS);
}

/** Разворачивает документ Firestore в RawBooking с числовыми временами. */
export function toRawBooking(data: Record<string, unknown>): RawBooking {
  return {
    ...(data as RawBooking),
    showStartAtMs:      timestampToMs(data.showStartAt),
    paymentExpiresAtMs: timestampToMs(data.paymentExpiresAt) ?? null,
  };
}

/** Сколько билетов реально занято по спектаклю — читается ВНУТРИ транзакции. */
export async function readSoldTickets(tx: Transaction, showId: string): Promise<number> {
  const snap = await tx.get(bookingsRef().where('showId', '==', showId) as Query);
  return sumOccupiedTickets(
    snap.docs.map(d => {
      const data = d.data() as RawBooking;
      return {
        status:        String(data.status ?? ''),
        paymentStatus: String(data.paymentStatus ?? ''),
        ticketsCount:  data.ticketsCount,
      };
    }),
  );
}

/** История броней пользователя — читается ВНУТРИ транзакции (нужна лояльности). */
export async function readUserBookings(tx: Transaction, uid: string): Promise<RawBooking[]> {
  const snap = await tx.get(bookingsRef().where('userId', '==', uid) as Query);
  return snap.docs.map(d => toRawBooking(d.data()));
}

/** Поиск брони по коду билета. Возвращает ссылку и данные либо null. */
export async function findByTicketCode(tx: Transaction, ticketCode: string) {
  const snap = await tx.get(bookingsRef().where('ticketCode', '==', ticketCode).limit(1) as Query);
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return { ref: doc.ref, id: doc.id, data: doc.data() as Record<string, unknown> };
}
