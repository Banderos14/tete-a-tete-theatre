// Типы админки. Отдельный модуль, чтобы вкладки и оболочка ссылались на одни
// и те же формы, не импортируя друг друга по кругу.

import type { BookingStatus } from '../../types/booking';

export type FilterShowId = 'all' | string;
export type FilterStatus = 'all' | BookingStatus;
export type AdminTab     = 'bookings' | 'users' | 'newsletter';

/** Действие, ожидающее подтверждения в модалке. */
export type ConfirmAction =
  | { type: 'paid';          bookingId: string }
  | { type: 'unpaid';        bookingId: string }
  | { type: 'cancel';        bookingId: string }
  | { type: 'deleteBooking'; bookingId: string }
  | { type: 'deleteUser';    uid: string; displayName: string }
  | null;
