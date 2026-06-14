import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Booking, NewBooking, BookingStatus, PaymentStatus } from '../types/booking';

function getTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  const t = ts as { toDate?: () => Date; seconds?: number };
  if (t.toDate) return t.toDate().getTime();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

const COLLECTION = 'bookings';

export async function createBooking(data: NewBooking): Promise<string> {
  // Seat check happens client-side via subscribeToShowBookedSeats + handleSubmit guard.
  // A getDocs query here with where('showId','==',id) violates Firestore security rules
  // for non-admin users (the rule requires resource.data.userId == auth.uid, so any
  // query that could return other users' documents is rejected with permission-denied).
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Одноразовый запрос истории броней пользователя (для проверки loyalty).
export async function getUserBookingsOnce(userId: string): Promise<Booking[]> {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  return snapshotToBookings(await getDocs(q)).sort((a, b) => {
    const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
    const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
    return tb - ta;
  });
}

// Realtime subscription — no composite index required (sorts client-side).
// Returns an unsubscribe function; call it when the component unmounts.
export function subscribeToUserBookings(
  userId: string,
  onUpdate: (bookings: Booking[]) => void,
  onError: (err: unknown) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  return onSnapshot(
    q,
    snap => {
      const sorted = snapshotToBookings(snap).sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
        return tb - ta;
      });
      onUpdate(sorted);
    },
    onError,
  );
}

export async function getAllBookings(filters: { showId?: string } = {}): Promise<Booking[]> {
  const constraints: QueryConstraint[] = [];
  if (filters.showId) constraints.push(where('showId', '==', filters.showId));
  const q = query(collection(db, COLLECTION), ...constraints);
  const sorted = snapshotToBookings(await getDocs(q)).sort((a, b) => {
    const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
    const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
    return tb - ta;
  });
  return sorted;
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), { status, updatedAt: serverTimestamp() });
}

export async function updatePaymentStatus(bookingId: string, paymentStatus: PaymentStatus): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), { paymentStatus, updatedAt: serverTimestamp() });
}

// Одна запись в Firestore: сразу ставит paid + confirmed.
// Важно: не вызывать updatePaymentStatus и updateBookingStatus по отдельности —
// иначе два события могут отправить два письма.
export async function markBookingPaid(bookingId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), {
    paymentStatus: 'paid',
    status: 'confirmed',
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Истекшая бронь: paymentStatus='expired', status='cancelled'.
// Документ не удаляется — история сохраняется.
export async function expireBooking(bookingId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), {
    paymentStatus: 'expired',
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

// Проверяет список броней: если время bank_transfer истекло — аннулирует.
// onExpired вызывается для каждой аннулированной брони, чтобы обновить локальный стейт.
export async function expireOverdueBookings(
  bookings: Booking[],
  onExpired: (id: string) => void,
): Promise<void> {
  const now = Date.now();
  const toExpire = bookings.filter(b => {
    if (b.paymentStatus !== 'awaiting_transfer') return false;
    const expiresMs = getTimestampMs(b.paymentExpiresAt);
    return expiresMs > 0 && expiresMs < now;
  });
  for (const b of toExpire) {
    await expireBooking(b.id);
    onExpired(b.id);
  }
}

// Часы до истечения срока оплаты (округлено вниз).
// null — если срок не задан; отрицательное число — уже истекло.
export function hoursUntilExpiry(booking: Booking): number | null {
  const expiresMs = getTimestampMs(booking.paymentExpiresAt);
  if (!expiresMs) return null;
  return Math.floor((expiresMs - Date.now()) / (1000 * 60 * 60));
}

export async function getBookingByTicketCode(ticketCode: string): Promise<Booking | null> {
  const q = query(collection(db, COLLECTION), where('ticketCode', '==', ticketCode));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as object) } as Booking;
}

function snapshotToBookings(snapshot: Awaited<ReturnType<typeof getDocs>>): Booking[] {
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Booking));
}

// Realtime subscription to the number of booked seats for a show.
// Active statuses (pending / confirmed / attended) reserve seats; cancelled does not.
export function subscribeToShowBookedSeats(
  showId: string,
  onUpdate: (bookedSeats: number) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('showId', '==', showId),
  );
  return onSnapshot(
    q,
    (snap) => {
      let total = 0;
      snap.forEach((d) => {
        const b = d.data() as Booking;
        if (b.status !== 'cancelled') {
          total += (b.ticketsCount ?? 1);
        }
      });
      onUpdate(total);
    },
    (err) => onError?.(err as Error),
  );
}

// User-initiated cancellation — stores reason and optional comment.
export async function cancelBookingByUser(
  bookingId: string,
  reason: string,
  comment?: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, bookingId);
  await updateDoc(ref, {
    status:      'cancelled',
    cancelledBy: 'user',
    cancelReason: reason,
    ...(comment ? { cancelComment: comment } : {}),
    cancelledAt: serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });
}
