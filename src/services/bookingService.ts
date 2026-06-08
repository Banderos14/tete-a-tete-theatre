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
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  const sorted = snapshotToBookings(await getDocs(q)).sort((a, b) => {
    const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
    const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
    return tb - ta;
  });
  return sorted;
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

export async function getShowBookings(showId: string): Promise<Booking[]> {
  const q = query(collection(db, COLLECTION), where('showId', '==', showId));
  const sorted = snapshotToBookings(await getDocs(q)).sort((a, b) => {
    const ta = (a.createdAt as { seconds?: number })?.seconds ?? 0;
    const tb = (b.createdAt as { seconds?: number })?.seconds ?? 0;
    return tb - ta;
  });
  return sorted;
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

// Marks payment as received AND confirms the booking in a single write.
// Use this instead of calling updatePaymentStatus + updateBookingStatus separately.
export async function markBookingPaid(bookingId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), {
    paymentStatus: 'paid',
    status: 'confirmed',
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Expires a booking: sets paymentStatus='expired', status='cancelled'.
// Does NOT delete the booking document.
export async function expireBooking(bookingId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), {
    paymentStatus: 'expired',
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

// Scans a list of bookings and expires any awaiting_transfer bookings
// whose paymentExpiresAt has passed. Calls onExpired(id) for each expired booking.
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

// Returns hours remaining until paymentExpiresAt (floored).
// Returns null if paymentExpiresAt is not set.
// Returns a negative number if already expired.
export function hoursUntilExpiry(booking: Booking): number | null {
  const expiresMs = getTimestampMs(booking.paymentExpiresAt);
  if (!expiresMs) return null;
  return Math.floor((expiresMs - Date.now()) / (1000 * 60 * 60));
}

export async function forceBookingPaymentMethod(bookingId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, bookingId), { paymentMethod: 'on_site', updatedAt: serverTimestamp() });
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
