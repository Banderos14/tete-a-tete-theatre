// Валидация входа на создание брони.
//
// Отделена от сервиса намеренно: это единственное место, где мы разбираем
// недоверенный ввод. Цена, статусы и код билета из запроса не читаются
// НИКОГДА — они считаются сервисом.

import { badRequest } from '../shared/errors.js';
import { MAX_COMMENT_LEN, MAX_PHONE_LEN, MIN_PHONE_LEN } from '../../shared/contracts/limits.js';
import { SHOWS, MAX_TICKETS_PER_BOOKING, type TicketTypeId, type ShowInfo } from '../../shared/catalog/shows.js';

export interface ValidatedBookingRequest {
  showId:        string;
  show:          ShowInfo;
  ticketType:    TicketTypeId;
  ticketsCount:  number;
  paymentMethod: 'on_site' | 'bank_transfer';
  phone:         string;
  comment:       string;
  lang:          'RU' | 'FR';
}

export function validateCreateBooking(body: Record<string, unknown>): ValidatedBookingRequest {
  const { showId, ticketType, ticketsCount, paymentMethod, comment, phone, lang } = body;

  if (typeof showId !== 'string' || !(showId in SHOWS)) {
    throw badRequest('Invalid showId');
  }
  if (ticketType !== 'standard' && ticketType !== 'student') {
    throw badRequest('ticketType must be standard or student');
  }
  if (
    typeof ticketsCount !== 'number' ||
    !Number.isInteger(ticketsCount) ||
    ticketsCount < 1 ||
    ticketsCount > MAX_TICKETS_PER_BOOKING
  ) {
    throw badRequest(`ticketsCount must be integer 1–${MAX_TICKETS_PER_BOOKING}`);
  }
  if (paymentMethod !== 'on_site' && paymentMethod !== 'bank_transfer') {
    throw badRequest('paymentMethod must be on_site or bank_transfer');
  }

  const phoneValue = typeof phone === 'string' ? phone.trim() : '';
  if (phoneValue.length < MIN_PHONE_LEN || phoneValue.length > MAX_PHONE_LEN) {
    throw badRequest('phone is required');
  }
  if (typeof comment === 'string' && comment.length > MAX_COMMENT_LEN) {
    throw badRequest(`comment must be at most ${MAX_COMMENT_LEN} characters`);
  }

  const show       = SHOWS[showId]!;
  const ticketInfo = show.tickets[ticketType];
  if (!ticketInfo) {
    throw badRequest(`ticketType '${ticketType}' not available for '${showId}'`);
  }

  return {
    showId,
    show,
    ticketType,
    ticketsCount,
    paymentMethod,
    phone:   phoneValue,
    comment: typeof comment === 'string' ? comment.trim().slice(0, MAX_COMMENT_LEN) : '',
    lang:    lang === 'FR' ? 'FR' : 'RU',
  };
}
