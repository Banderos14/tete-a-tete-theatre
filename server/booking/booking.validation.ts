// Валидация входа на создание брони.
//
// Отделена от сервиса намеренно: это единственное место, где мы разбираем
// недоверенный ввод. Цена, статусы и код билета из запроса не читаются
// НИКОГДА — они считаются сервисом.

import { badRequest } from '../shared/errors.js';
import { MAX_COMMENT_LEN, MAX_PHONE_LEN, MIN_PHONE_LEN } from '../../shared/contracts/limits.js';
import { SHOWS, MAX_TICKETS_PER_BOOKING, type TicketTypeId, type ShowInfo } from '../../shared/catalog/shows.js';
import type { BasketLine } from '../../shared/domain/ticketBasket.js';

export interface ValidatedBookingRequest {
  showId:        string;
  show:          ShowInfo;
  /**
   * Состав брони: тарифы и количества (без цен — цены берёт сервис из каталога).
   * Старый формат запроса ticketType × ticketsCount даёт одну строку.
   */
  lines:         BasketLine[];
  /** Первый тариф корзины — для старых полей брони. */
  ticketType:    TicketTypeId;
  /** Всего билетов в брони. */
  ticketsCount:  number;
  paymentMethod: 'on_site' | 'bank_transfer' | 'online';
  phone:         string;
  comment:       string;
  lang:          'RU' | 'FR';
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Состав корзины из запроса. items — новый формат (несколько тарифов в одной
 * брони); без него — прежний ticketType × ticketsCount. Цены из запроса не
 * читаются ни в каком виде.
 */
function parseLines(body: Record<string, unknown>, show: ShowInfo, showId: string): BasketLine[] {
  const knownType = (t: unknown): t is TicketTypeId =>
    typeof t === 'string' && Object.hasOwn(show.tickets, t) && !!show.tickets[t as TicketTypeId];

  let lines: BasketLine[];
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > Object.keys(show.tickets).length) {
      throw badRequest('items must be a non-empty array of ticket types');
    }
    const seen = new Set<string>();
    lines = [];
    for (const raw of body.items as unknown[]) {
      const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      if (!knownType(item.ticketType)) {
        throw badRequest(`ticketType '${String(item.ticketType)}' not available for '${showId}'`);
      }
      if (seen.has(item.ticketType)) throw badRequest(`ticketType '${item.ticketType}' is repeated`);
      seen.add(item.ticketType);
      if (!isCount(item.quantity) || item.quantity < 0 || item.quantity > MAX_TICKETS_PER_BOOKING) {
        throw badRequest(`quantity must be integer 0–${MAX_TICKETS_PER_BOOKING}`);
      }
      if (item.quantity > 0) lines.push({ type: item.ticketType, quantity: item.quantity });
    }
  } else {
    if (typeof body.ticketType !== 'string') throw badRequest('ticketType must be a string');
    if (!knownType(body.ticketType)) {
      throw badRequest(`ticketType '${body.ticketType}' not available for '${showId}'`);
    }
    if (!isCount(body.ticketsCount)) {
      throw badRequest(`ticketsCount must be integer 1–${MAX_TICKETS_PER_BOOKING}`);
    }
    lines = [{ type: body.ticketType, quantity: body.ticketsCount }];
  }

  const total = lines.reduce((s, l) => s + l.quantity, 0);
  if (total < 1 || total > MAX_TICKETS_PER_BOOKING) {
    throw badRequest(`ticketsCount must be integer 1–${MAX_TICKETS_PER_BOOKING}`);
  }
  // Порядок каталога: первый тариф корзины не зависит от порядка в запросе.
  const order = Object.keys(show.tickets);
  return lines.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

export function validateCreateBooking(body: Record<string, unknown>): ValidatedBookingRequest {
  const { showId, paymentMethod, comment, phone, lang } = body;

  // Object.hasOwn, а не `in`: `in` находит и наследованные ключи, поэтому
  // showId вида 'constructor' или '__proto__' проходил первую проверку и
  // отсеивался только ниже, по отсутствию tickets.
  if (typeof showId !== 'string' || !Object.hasOwn(SHOWS, showId)) {
    throw badRequest('Invalid showId');
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

  const show  = SHOWS[showId]!;
  const lines = parseLines(body, show, showId);

  return {
    showId,
    show,
    lines,
    ticketType:   lines[0]!.type,
    ticketsCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    paymentMethod,
    phone:   phoneValue,
    comment: typeof comment === 'string' ? comment.trim().slice(0, MAX_COMMENT_LEN) : '',
    lang:    lang === 'FR' ? 'FR' : 'RU',
  };
}
