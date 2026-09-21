// Клиент POST /api/admin-booking — все админские действия с бронью.
//
// Сканер и таблица админки ходят сюда. Браузер присылает только код билета
// или id брони и действие; статусы, суммы и спектакль брони сервер читает
// сам, проверки и записи — в транзакциях, письма уходят с сервера.

import { auth } from '../firebase/config';
import type {
  AdminBookingAction, CheckinBooking, CheckinGroup,
} from '../../shared/contracts/checkin';

export type { CheckinBooking, CheckinGroup, AdminBookingAction };

export interface AdminBookingResult {
  ok:      boolean;
  changed: boolean;
  booking: CheckinBooking | null;
  /** Группа броней зрителя на этот спектакль; null — одиночный режим. */
  group:   CheckinGroup | null;
  /** Машиночитаемая причина отказа: not_found, already_attended, wrong_show, ... */
  reason?: string;
  error?:  string;
  /** Результат письма, если действие его отправляло. */
  ticketEmail?: 'sent' | 'skipped' | 'failed';
}

export interface AdminBookingRequest {
  action:      AdminBookingAction;
  ticketCode?: string;
  bookingId?:  string;
  /** Спектакль, на котором стоит сотрудник (для прохода). */
  showId?:     string;
}

async function adminToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function adminBookingAction(request: AdminBookingRequest): Promise<AdminBookingResult> {
  const resp = await fetch('/api/admin-booking', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await adminToken()}` },
    body:    JSON.stringify(request),
  });
  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
  return {
    ok:      resp.ok,
    changed: data.changed === true,
    booking: (data.booking as CheckinBooking | undefined) ?? null,
    group:   (data.group as CheckinGroup | undefined) ?? null,
    reason:  typeof data.reason === 'string' ? data.reason : undefined,
    error:   typeof data.error === 'string' ? data.error : undefined,
    ticketEmail: data.ticketEmail === 'sent' || data.ticketEmail === 'skipped' || data.ticketEmail === 'failed'
      ? data.ticketEmail : undefined,
  };
}

/** Действие таблицы админки; при отказе бросает Error с понятным текстом. */
export async function adminBookingMutation(request: AdminBookingRequest): Promise<AdminBookingResult> {
  const res = await adminBookingAction(request);
  if (!res.ok) {
    const err = new Error(res.error ?? 'Request failed') as Error & { reason?: string };
    err.reason = res.reason;
    throw err;
  }
  return res;
}
