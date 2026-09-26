// Публичный вид брони по коду билета — одно правило для сервера и тестов.
//
// Страница /#/ticket открывается без входа, поэтому решает здесь не зритель, а
// документ брони: отменённая, возвращённая или неоплаченная онлайн бронь не
// получает QR. Функция чистая — на вход документ Firestore, на выход ровно те
// поля, что уходят в браузер (белый список, см. shared/contracts/ticket.ts).

import type { PublicTicket, PublicTicketPayment, PublicTicketState } from '../contracts/ticket.js';
import { localizedShowTitle } from '../catalog/showTitle.js';
import { localeDate } from '../email/layout.js';
import { bookingTicketLines } from './ticketBasket.js';
import { isScannableTicket } from './bookingRules.js';

/** Поля брони, из которых собирается публичный вид. */
export interface PublicTicketSource {
  status?:        unknown;
  paymentStatus?: unknown;
  paymentMethod?: unknown;
  refund?:        unknown;
  showId?:        unknown;
  showTitle?:     unknown;
  showDate?:      unknown;
  showTime?:      unknown;
  ticketsCount?:  unknown;
  seatsCount?:    unknown;
  ticketType?:    unknown;
  ticketItems?:   unknown;
  totalAmount?:   unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function publicTicketState(b: PublicTicketSource): PublicTicketState {
  const status        = str(b.status);
  const paymentStatus = str(b.paymentStatus);
  const refundStatus  = str((b.refund as { status?: unknown } | null | undefined)?.status);

  if (status === 'attended') return 'attended';
  if (status === 'cancelled' || paymentStatus === 'expired' || paymentStatus === 'refunded') {
    // Возврат в процессе (pending) — деньги уже идут обратно, зрителю это и важно.
    const refunded = paymentStatus === 'refunded' || refundStatus === 'pending' || refundStatus === 'succeeded';
    return refunded ? 'refunded' : 'cancelled';
  }
  if (paymentStatus === 'awaiting_online') return 'payment_pending';
  // То же правило, что решает, класть ли QR в письмо и кабинет.
  return isScannableTicket({ status, paymentStatus }) ? 'active' : 'cancelled';
}

function paymentOf(b: PublicTicketSource): PublicTicketPayment {
  if (b.paymentStatus === 'paid') return 'paid';
  if (b.paymentStatus === 'awaiting_transfer') return 'transfer';
  return 'on_site';
}

export function toPublicTicket(code: string, b: PublicTicketSource): PublicTicket {
  const state  = publicTicketState(b);
  const source = { showId: str(b.showId) || undefined, showTitle: str(b.showTitle) };
  const lines  = bookingTicketLines(b).map(l => ({ type: l.type, quantity: l.quantity }));
  const seats  = typeof b.seatsCount === 'number' && b.seatsCount > 0
    ? b.seatsCount
    : lines.reduce((sum, l) => sum + l.quantity, 0);

  const ticket: PublicTicket = {
    code,
    state,
    showId: str(b.showId),
    title:  { RU: localizedShowTitle(source, 'RU'), FR: localizedShowTitle(source, 'FR') },
    date:   { RU: localeDate(str(b.showDate), 'RU'), FR: localeDate(str(b.showDate), 'FR') },
    time:   str(b.showTime),
    seats,
    lines,
  };

  if (state === 'active') {
    ticket.payment = paymentOf(b);
    if (ticket.payment !== 'paid' && typeof b.totalAmount === 'number') ticket.amountDue = b.totalAmount;
  }
  return ticket;
}
