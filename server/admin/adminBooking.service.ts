// Единый вход админских действий с бронью: POST /api/admin-booking.
//
// Один endpoint вместо трёх (checkin-ticket, delete-booking, send-email):
// на Hobby-плане Vercel не больше 12 функций на деплой. Клиент присылает
// идентификатор (код билета или id брони) и действие — всё остальное сервер
// читает из Firestore сам. Письма (оплата, отмена, повторная отправка) уходят
// отсюда же, после успешной записи, и никогда её не откатывают.

import { badRequest, tooManyRequests } from '../shared/errors.js';
import { consumeRateLimit } from '../shared/rateLimit.js';
import { db } from '../booking/booking.repository.js';
import { checkinTicket } from '../checkin/checkin.service.js';
import { groupCheckin, inspectGroup } from '../checkin/group.service.js';
import { deleteCancelledBooking } from '../booking/deletion.service.js';
import { cancelBookingByAdmin, markUnpaidByAdmin, parseBookingId } from '../booking/admin.service.js';
import { sendBookingEmail } from '../email/ticketEmail.service.js';
import type { AdminBookingAction } from '../../shared/contracts/checkin.js';

const ACTIONS: readonly AdminBookingAction[] = [
  'inspect', 'mark_attended', 'mark_paid', 'group_checkin',
  'mark_unpaid', 'cancel', 'resend_ticket', 'delete',
];

// Повторная отправка билета — ручное действие; лимит защищает квоту Resend
// от случайного «залипшего» клика.
const RESEND_LIMIT_PER_HOUR = 60;

export async function runAdminBookingAction(adminUid: string, body: Record<string, unknown>): Promise<object> {
  const action = (body.action ?? 'inspect') as AdminBookingAction;
  if (!ACTIONS.includes(action)) throw badRequest('Unknown action');

  switch (action) {
    case 'inspect': {
      const result = await checkinTicket({ adminUid, ticketCode: body.ticketCode, action, showId: body.showId });
      // Скан показывает и остальные брони зрителя на этот спектакль. Только чтение.
      const group = await inspectGroup(result.booking.ticketCode, body.showId);
      return group ? { ...result, group } : result;
    }
    case 'mark_attended':
      return checkinTicket({ adminUid, ticketCode: body.ticketCode, action, showId: body.showId });

    case 'mark_paid': {
      const result = await checkinTicket({ adminUid, ticketCode: body.ticketCode, action });
      // Самое свежее письмо — полноценный билет: оплата подтверждена + QR.
      // Прошедшему в зал письмо-билет не нужно.
      const email = result.changed && result.booking.status !== 'attended'
        ? await sendBookingEmail(result.booking.bookingId, 'paid')
        : null;
      return { ...result, ...(email ? { ticketEmail: email.status } : {}) };
    }
    case 'group_checkin':
      // Оплата и проход одной транзакцией. Зритель уже в зале — письмо
      // «оплата получена» с билетом ему не нужно и не тратит квоту.
      return groupCheckin({ adminUid, ticketCode: body.ticketCode, showId: body.showId });

    case 'mark_unpaid':
      return markUnpaidByAdmin(body.bookingId);

    case 'cancel': {
      const result = await cancelBookingByAdmin(adminUid, body.bookingId);
      const email  = await sendBookingEmail(result.bookingId, 'cancelled');
      return { ...result, ticketEmail: email.status };
    }
    case 'resend_ticket': {
      const bookingId = parseBookingId(body.bookingId);
      const limit = await consumeRateLimit(db(), {
        bucket: `ticket-resend:${adminUid}`, limit: RESEND_LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000,
      });
      if (!limit.allowed) throw tooManyRequests('Too many resends, try again later');
      const email = await sendBookingEmail(bookingId, 'resend', { force: true });
      return { ok: email.status === 'sent', bookingId, ticketEmail: email.status, reason: email.reason };
    }
    case 'delete':
      return deleteCancelledBooking(adminUid, body.bookingId);
  }
}
