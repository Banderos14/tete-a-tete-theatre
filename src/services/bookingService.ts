import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { Booking, BookingStatus, PaymentStatus } from '../types/booking';
import { shouldMarkAsAttended } from './attendanceService';

// ── Server-side booking API ───────────────────────────────────────────────────

export interface CreateBookingRequest {
  showId:        string;
  ticketType:    'standard' | 'student';
  ticketsCount:  number;
  paymentMethod: 'on_site' | 'bank_transfer';
  comment:       string;
  phone:         string;
  lang:          'RU' | 'FR';
}

// Генерирует ключ идемпотентности для ОДНОЙ попытки бронирования.
// Новый осознанный заказ получает новый ключ и создаётся штатно.
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateBookingResult {
  bookingId:               string;
  ticketCode:              string;
  totalAmount:             number;
  priceInfo:               string;
  showDate:                string;
  showTime:                string;
  showTitle:               string;
  showTitleFR?:            string;
  paymentReference?:       string;
  paymentExpiresAt?:       number;
  originalAmount?:         number;
  loyaltyDiscountApplied?: boolean;
  loyaltyDiscountAmount?:  number;
}

// Ошибка API бронирования с машиночитаемой причиной — чтобы UI показал
// осмысленный текст, а не общее «что-то пошло не так».
export interface BookingApiError extends Error {
  reason?:    string;
  remaining?: number;
}

export async function createBookingViaApi(
  request: CreateBookingRequest,
  idToken: string,
  idempotencyKey?: string,
): Promise<CreateBookingResult> {
  const resp = await fetch('/api/create-booking', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
      // Повторная отправка той же формы не должна создавать вторую бронь.
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(request),
  });
  const data = await resp.json() as Record<string, unknown>;
  if (!resp.ok) {
    const err = new Error(
      typeof data['error'] === 'string' ? data['error'] : `HTTP ${resp.status}`,
    ) as BookingApiError;
    if (typeof data['reason'] === 'string') err.reason = data['reason'];
    if (typeof data['remaining'] === 'number') err.remaining = data['remaining'];
    throw err;
  }
  return data as unknown as CreateBookingResult;
}

function getTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  const t = ts as { toDate?: () => Date; seconds?: number };
  if (t.toDate) return t.toDate().getTime();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

const COLLECTION = 'bookings';

// Realtime-подписка без составного индекса (сортировка на клиенте).
// Возвращает функцию отписки — вызывать при анмаунте компонента.
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

// Отмена по инициативе пользователя.
//
// Идёт через /api/cancel-booking, а не напрямую в Firestore: правила безопасности
// пользовательских записей в bookings не разрешают вовсе, а бизнес-правила отмены
// (нельзя отменить оплаченную, посещённую или уже начавшийся спектакль) должны
// проверяться на сервере, а не в браузере.
export async function cancelBookingByUser(
  bookingId: string,
  reason: string,
  comment?: string,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');
  const idToken = await currentUser.getIdToken();

  const resp = await fetch('/api/cancel-booking', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ bookingId, reason, ...(comment ? { comment } : {}) }),
  });

  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(typeof data['error'] === 'string' ? data['error'] : `HTTP ${resp.status}`);
  }
}

// Проставляет attended для подходящих броней.
//
// Вызывается ТОЛЬКО из админки: правила Firestore не разрешают обычному
// пользователю менять status, и раньше личный кабинет при каждом открытии
// генерировал пачку заведомо отклоняемых записей (ошибки глушились .catch).
// Интерфейс зрителя показывает посещение через computedIsAttended и в записи
// не нуждается.
export async function markEligibleBookingsAsAttended(
  bookings: Booking[],
  onUpdate: (bookingId: string) => void,
): Promise<void> {
  const eligible = bookings.filter(b => shouldMarkAsAttended(b));
  for (const b of eligible) {
    await updateBookingStatus(b.id, 'attended');
    onUpdate(b.id);
  }
}
