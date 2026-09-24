// Корзина билетов одной брони: несколько тарифов в одной брони.
//
// Изоморфный модуль. Одну и ту же формулу применяют транзакция создания брони
// на сервере (авторитетная цена, её получает Stripe) и форма брони (только
// показ). Цены берутся из каталога спектакля, от клиента приходят лишь тарифы
// и количества.
//
// Бронь по-прежнему одна: один код, один QR, одна сумма, одна сессия Stripe.
// Состав хранится в bookings/{id}.ticketItems. Старые брони без него
// описываются полями ticketType × ticketsCount — см. bookingTicketLines().
//
// Лояльность: скидка 50 % по-прежнему на ОДИН билет брони. Когда тарифов
// несколько, это самый дорогой билет корзины: так зритель получает ровно ту
// скидку, которую получил бы, оформив этот билет отдельной бронью, — смешанная
// корзина скидку не уменьшает и не увеличивает. Для брони одного тарифа ничего
// не меняется.

import type { TicketTypeId } from '../catalog/shows.js';
import { loyaltyDiscountForTicket } from './loyalty.js';

export interface BasketTariff {
  id:    TicketTypeId;
  price: number;
  /** Мест в зале на одну единицу тарифа (семейный билет — три). */
  seats: number;
  /** Сколько единиц тарифа можно взять (ограничение формы). */
  available?: number;
}

export interface BasketLine {
  type:     TicketTypeId;
  quantity: number;
}

/** Строка состава, как её пишет сервер в bookings/{id}.ticketItems. */
export interface TicketItem {
  type:      TicketTypeId;
  quantity:  number;
  unitPrice: number;
  seats:     number;
  subtotal:  number;
}

export interface BasketPrice {
  items:          TicketItem[];
  ticketsCount:   number;
  seatsCount:     number;
  baseAmount:     number;
  discountAmount: number;
  /** Тариф билета, на который пришлась скидка лояльности; null — скидки нет. */
  discountTicketType: TicketTypeId | null;
  totalAmount:    number;
}

/**
 * Цена корзины. Порядок строк — порядок тарифов в каталоге, строки с нулём
 * отбрасываются. Неизвестный тариф — ошибка (валидация должна отсечь раньше).
 */
export function priceBasket(
  tariffs: readonly BasketTariff[],
  lines: readonly BasketLine[],
  loyaltyAvailable: boolean,
): BasketPrice {
  const qty = new Map<TicketTypeId, number>();
  for (const l of lines) {
    if (!tariffs.some(t => t.id === l.type)) throw new Error(`Unknown ticket type: ${l.type}`);
    qty.set(l.type, (qty.get(l.type) ?? 0) + l.quantity);
  }

  const items: TicketItem[] = [];
  for (const t of tariffs) {
    const q = qty.get(t.id) ?? 0;
    if (q > 0) items.push({ type: t.id, quantity: q, unitPrice: t.price, seats: t.seats, subtotal: t.price * q });
  }

  const ticketsCount = items.reduce((s, i) => s + i.quantity, 0);
  const seatsCount   = items.reduce((s, i) => s + i.quantity * i.seats, 0);
  const baseAmount   = items.reduce((s, i) => s + i.subtotal, 0);

  // Самый дорогой билет корзины; при равной цене — первый по каталогу.
  const target = loyaltyAvailable && items.length
    ? items.reduce((best, i) => (i.unitPrice > best.unitPrice ? i : best))
    : null;
  const discountAmount = target ? loyaltyDiscountForTicket(target.unitPrice) : 0;

  return {
    items, ticketsCount, seatsCount, baseAmount, discountAmount,
    discountTicketType: target?.type ?? null,
    totalAmount: baseAmount - discountAmount,
  };
}

/** Тарифы каталога спектакля в виде списка — для priceBasket на сервере. */
export function catalogTariffs(
  tickets: Partial<Record<TicketTypeId, { price: number; seats: number }>>,
): BasketTariff[] {
  return (Object.entries(tickets) as Array<[TicketTypeId, { price: number; seats: number } | undefined]>)
    .filter((e): e is [TicketTypeId, { price: number; seats: number }] => !!e[1])
    .map(([id, t]) => ({ id, price: t.price, seats: t.seats }));
}

// ── Ограничения формы ───────────────────────────────────────────────────────

export interface BasketLimits {
  /** Максимум билетов в брони (MAX_TICKETS_PER_BOOKING). */
  maxTickets: number;
  /** Свободно мест в зале; null — неизвестно (решит сервер). */
  seatsLeft:  number | null;
}

function totals(tariffs: readonly BasketTariff[], lines: readonly BasketLine[]) {
  let tickets = 0, seats = 0;
  for (const l of lines) {
    const t = tariffs.find(x => x.id === l.type);
    tickets += l.quantity;
    seats   += l.quantity * (t?.seats ?? 1);
  }
  return { tickets, seats };
}

/**
 * Корзина формы для текущего спектакля: только тарифы этого спектакля с
 * количеством больше нуля; пусто — один билет первого тарифа (выбор по умолчанию).
 *
 * Тарифы другого спектакля (корзина осталась с прошлого открытия формы)
 * отбрасываются: иначе priceBasket бросил бы «Unknown ticket type», и форма
 * падала бы при открытии брони следующего спектакля.
 */
export function basketLinesFor(tariffs: readonly BasketTariff[], stored: readonly BasketLine[]): BasketLine[] {
  const own = stored.filter(l => l.quantity > 0 && tariffs.some(t => t.id === l.type));
  if (own.length || !tariffs[0]) return own;
  return [{ type: tariffs[0].id, quantity: 1 }];
}

/** Можно ли добавить ещё один билет тарифа, не нарушив лимиты. */
export function canAddTicket(
  tariffs: readonly BasketTariff[], lines: readonly BasketLine[], type: TicketTypeId, limits: BasketLimits,
): boolean {
  const t = tariffs.find(x => x.id === type);
  if (!t) return false;
  const { tickets, seats } = totals(tariffs, lines);
  const current = lines.find(l => l.type === type)?.quantity ?? 0;
  if (tickets + 1 > limits.maxTickets) return false;
  if (typeof t.available === 'number' && current + 1 > t.available) return false;
  if (limits.seatsLeft !== null && seats + t.seats > limits.seatsLeft) return false;
  return true;
}

/** Можно ли убрать билет тарифа: в корзине всегда остаётся хотя бы один билет. */
export function canRemoveTicket(lines: readonly BasketLine[], type: TicketTypeId): boolean {
  const current = lines.find(l => l.type === type)?.quantity ?? 0;
  const total   = lines.reduce((s, l) => s + l.quantity, 0);
  return current > 0 && total > 1;
}

/** Новое количество одного тарифа; остальные строки не трогаются. */
export function setLineQuantity(lines: readonly BasketLine[], type: TicketTypeId, quantity: number): BasketLine[] {
  const q = Math.max(0, Math.floor(quantity));
  const rest = lines.filter(l => l.type !== type);
  return q > 0 ? [...rest, { type, quantity: q }] : rest;
}

/**
 * Урезать корзину под лимиты (стало известно, что мест меньше). Убирает
 * билеты с конца каталога, но хотя бы один билет оставляет — отказ по
 * вместимости всё равно скажет сервер.
 */
export function clampBasket(
  tariffs: readonly BasketTariff[], lines: readonly BasketLine[], limits: BasketLimits,
): BasketLine[] {
  let next = lines.filter(l => l.quantity > 0).map(l => ({ ...l }));
  const fits = () => {
    const { tickets, seats } = totals(tariffs, next);
    return tickets <= limits.maxTickets && (limits.seatsLeft === null || seats <= limits.seatsLeft);
  };
  const order = [...tariffs].reverse();
  while (!fits() && next.reduce((s, l) => s + l.quantity, 0) > 1) {
    const victim = order.map(t => next.find(l => l.type === t.id && l.quantity > 0)).find(Boolean);
    if (!victim) break;
    victim.quantity -= 1;
    next = next.filter(l => l.quantity > 0);
  }
  return next;
}

// ── Состав брони для показа ─────────────────────────────────────────────────

export interface BookingLine {
  type:      string;
  quantity:  number;
  unitPrice?: number;
}

/**
 * Состав брони: ticketItems новых броней или ticketType × ticketsCount старых.
 * Миграция не нужна — старая бронь описывается одной строкой.
 */
export function bookingTicketLines(b: {
  ticketItems?: unknown; ticketType?: unknown; ticketsCount?: unknown;
}): BookingLine[] {
  if (Array.isArray(b.ticketItems)) {
    const lines = b.ticketItems
      .filter((i): i is { type: string; quantity: number; unitPrice?: unknown } =>
        !!i && typeof (i as { type?: unknown }).type === 'string'
        && typeof (i as { quantity?: unknown }).quantity === 'number' && (i as { quantity: number }).quantity > 0)
      .map(i => ({
        type: i.type, quantity: i.quantity,
        ...(typeof i.unitPrice === 'number' ? { unitPrice: i.unitPrice } : {}),
      }));
    if (lines.length) return lines;
  }
  const count = typeof b.ticketsCount === 'number' && b.ticketsCount > 0 ? b.ticketsCount : 1;
  return [{ type: typeof b.ticketType === 'string' ? b.ticketType : '', quantity: count }];
}

/** В брони больше одного тарифа. */
export function isMixedBooking(b: Parameters<typeof bookingTicketLines>[0]): boolean {
  return bookingTicketLines(b).length > 1;
}
