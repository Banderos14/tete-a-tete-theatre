// Публичный просмотр билета по коду: GET /api/public-ticket?code=XXXX-XXXX.
//
// Только чтение. Ссылку «Открыть билет» из письма зритель часто открывает в
// другом браузере (Gmail → Chrome, а входил он в Safari) — кабинет попросил
// бы войти заново. Код брони — предъявительский идентификатор, он и так
// напечатан на билете и зашит в QR, поэтому по нему отдаётся только то, что
// нужно у входа (белый список — toPublicTicket). Бронь не меняется, правила
// Firestore не ослабляются: читает Admin SDK на сервере.
//
// Перебор кодов: алфавит 31 символ × 8 позиций ≈ 8,5·10¹¹ вариантов, плюс
// лимит запросов с одного адреса.

import { normalizeTicketCodeInput } from '../../shared/domain/ticketCode.js';
import { toPublicTicket, type PublicTicketSource } from '../../shared/domain/publicTicket.js';
import type { PublicTicket } from '../../shared/contracts/ticket.js';
import { badRequest, notFound, tooManyRequests } from '../shared/errors.js';
import { consumeRateLimit } from '../shared/rateLimit.js';
import { bookingsRef, db } from './booking.repository.js';

export const PUBLIC_TICKET_LIMIT     = 60;
export const PUBLIC_TICKET_WINDOW_MS = 10 * 60 * 1000;

export async function readPublicTicket(rawCode: unknown, ip: string): Promise<PublicTicket> {
  const code = normalizeTicketCodeInput(typeof rawCode === 'string' ? rawCode : '');
  if (!code) throw badRequest('Invalid ticket code', 'invalid_code');

  const limit = await consumeRateLimit(db(), {
    bucket: `public-ticket:${ip}`, limit: PUBLIC_TICKET_LIMIT, windowMs: PUBLIC_TICKET_WINDOW_MS,
  });
  if (!limit.allowed) throw tooManyRequests('Too many requests', { retryAtMs: limit.resetAtMs });

  const snap = await bookingsRef().where('ticketCode', '==', code).limit(1).get();
  if (snap.empty) throw notFound('Ticket not found', 'not_found');
  return toPublicTicket(code, snap.docs[0]!.data() as PublicTicketSource);
}
