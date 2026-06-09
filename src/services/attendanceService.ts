import { updateBookingStatus } from './bookingService';
import type { Booking } from '../types/booking';

// Russian 3-letter month abbreviations used in showDate strings (e.g. "17 Май 2026")
const MONTH_RU: Record<string, number> = {
  'Янв': 0, 'Фев': 1, 'Мар': 2, 'Апр': 3,
  'Май': 4, 'Июн': 5, 'Июл': 6, 'Авг': 7,
  'Сен': 8, 'Окт': 9, 'Ноя': 10, 'Дек': 11,
};

// Returns the time when the show is considered "over" (start + 2 h buffer).
function parseShowEnd(showDate: string, showTime: string): Date | null {
  const parts = showDate.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const month = MONTH_RU[monthStr];
  if (month === undefined) return null;
  const [hStr, mStr] = showTime.split(':');
  const day  = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  const hour = parseInt(hStr, 10);
  const min  = parseInt(mStr ?? '0', 10);
  if (isNaN(day) || isNaN(year) || isNaN(hour)) return null;
  const start = new Date(year, month, day, hour, min, 0);
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

// Pure check: should this booking be considered attended?
// Requires confirmed + paid + show ended 2+ hours ago.
export function shouldMarkAsAttended(booking: Booking): boolean {
  if (booking.status !== 'confirmed') return false;
  if (booking.paymentStatus !== 'paid') return false;
  const end = parseShowEnd(booking.showDate, booking.showTime);
  if (!end) return false;
  return end < new Date();
}

// Вычисленный статус — используется в UI, чтобы сразу показать "посещено"
// без ожидания обновления Firestore (AdminPage пишет async, ProfileDrawer считает сам).
export function computedIsAttended(booking: Booking): boolean {
  return booking.status === 'attended' || shouldMarkAsAttended(booking);
}

// Writes attended status to Firestore for all eligible bookings.
// Calls onUpdate(bookingId) after each successful write so the caller can
// update local state incrementally.
// Safe to call repeatedly: shouldMarkAsAttended guards against re-marking.
export async function markEligibleBookingsAsAttended(
  bookings: Booking[],
  onUpdate: (bookingId: string) => void,
): Promise<void> {
  const eligible = bookings.filter(shouldMarkAsAttended);
  for (const b of eligible) {
    await updateBookingStatus(b.id, 'attended');
    onUpdate(b.id);
  }
}
