import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Booking, NewBooking, BookingStatus, PaymentStatus } from '../types/booking';

const COLLECTION = 'bookings';

export async function createBooking(data: NewBooking): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getUserBookings(userId: string): Promise<Booking[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  return snapshotToBookings(await getDocs(q));
}

export async function getShowBookings(showId: string): Promise<Booking[]> {
  const q = query(
    collection(db, COLLECTION),
    where('showId', '==', showId),
    orderBy('createdAt', 'desc'),
  );
  return snapshotToBookings(await getDocs(q));
}

export async function getAllBookings(filters: { showId?: string } = {}): Promise<Booking[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (filters.showId) constraints.unshift(where('showId', '==', filters.showId));

  const q = query(collection(db, COLLECTION), ...constraints);
  return snapshotToBookings(await getDocs(q));
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
    updatedAt: serverTimestamp(),
  });
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
