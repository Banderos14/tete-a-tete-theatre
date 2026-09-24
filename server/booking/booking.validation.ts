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
  paymentMethod: 'on_site' | 'bank_transfer' | 'online';
  phone:         string;
  comment:       string;
  lang:          'RU' | 'FR';
}

export function validateCreateBooking(body: Record<string, unknown>): ValidatedBookingRequest {
  const { showId, ticketType, ticketsCount, paymentMethod, comment, phone, lang } = body;

  // Object.hasOwn, а не `in`: `in` находит и наследованные ключи, поэтому
  // showId вида 'constructor' или '__proto__' проходил первую проверку и
  // отсеивался только ниже, по отсутствию tickets.
  if (typeof showId !== 'string' || !Object.hasOwn(SHOWS, showId)) {
    throw badRequest('Invalid showId');
  }
  if (typeof ticketType !== 'string') {
    throw badRequest('ticketType must be a string');
  }
  if (
    typeof ticketsCount !== 'number' ||
    !Number.isInteger(ticketsCount) ||
    ticketsCount < 1 ||
    ticketsCount > MAX_TICKETS_PER_BOOKING
  ) {
    throw badRequest(`ticketsCount must be integer 1–${MAX_TICKETS_PER_BOOKING}`);
  }
  if (paymentMethod !== 'on_site' && paymentMethod !== 'bank_transfer' && paymentMethod !== 'online') {
    throw badRequest('paymentMethod must be on_site, bank_transfer or online');
  }

  const phoneValue = typeof phone === 'string' ? phone.trim() : '';
  if (phoneValue.length < MIN_PHONE_LEN || phoneValue.length > MAX_PHONE_LEN) {
    throw badRequest('phone is required');
  }
  if (typeof comment === 'string' && comment.length > MAX_COMMENT_LEN) {
    throw badRequest(`comment must be at most ${MAX_COMMENT_LEN} characters`);
  }

  const show = SHOWS[showId]!;
  if (!Object.hasOwn(show.tickets, ticketType)) {
    throw badRequest(`ticketType '${ticketType}' not available for '${showId}'`);
  }
  const typedTicketType = ticketType as TicketTypeId;
  const ticketInfo = show.tickets[typedTicketType];
  if (!ticketInfo) {
    throw badRequest(`ticketType '${typedTicketType}' not available for '${showId}'`);
  }

  return {
    showId,
    show,
    ticketType: typedTicketType,
    ticketsCount,
    paymentMethod,
    phone:   phoneValue,
    comment: typeof comment === 'string' ? comment.trim().slice(0, MAX_COMMENT_LEN) : '',
    lang:    lang === 'FR' ? 'FR' : 'RU',
  };
}
