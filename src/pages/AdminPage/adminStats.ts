// Сводка вкладки «Брони»: брони, билеты и касса — по спектаклю и в целом.
// Без React, поэтому проверяется юнит-тестом.
//
// «Броней» и «билетов» — только АКТИВНЫЕ, по тому же правилу, по которому
// сервер считает занятые места (occupiesCapacity в shared/domain/bookingRules):
// отменённая и протухшая бронь места не держит и в сводку не входит.
// Раньше сюда шёл весь список, и отменённая бронь на 3 билета продолжала
// показываться как «1 бронирование · 3 билета», хотя места уже были свободны.

import { countActiveBookings, sumOccupiedTickets } from '../../../shared/domain/bookingRules';
import { THEATRE_CAPACITY } from '../../../shared/catalog/shows';
import { centsToEuros } from '../../../shared/domain/money';
import type { Booking } from '../../types/booking';
import type { Show } from '../../types';

export interface BookingSummary {
  /** Активные брони. */
  bookings: number;
  /**
   * Занятые МЕСТА активных броней (не число билетов: семейный билет — 3 места,
   * смешанная корзина — сумма мест всех тарифов). Поле названо tickets
   * исторически; в интерфейсе подписано «мест».
   */
  tickets: number;
  /** Фактически полученные и не возвращённые деньги, € — см. paidRevenue. */
  revenue: number;
}

/** Снимок для доменных правил: у старых документов статусы могут отсутствовать. */
function toSnapshot(b: Booking) {
  return {
    status:        b.status ?? 'pending',
    paymentStatus: b.paymentStatus ?? 'not_paid',
    ticketsCount:  b.ticketsCount,
    seatsCount:    b.seatsCount,
  };
}

/**
 * Сколько денег по брони возвращено через Stripe (только завершённые возвраты), €.
 * Реестр refunds — все возвраты платежа; у броней до реестра — одно поле refund.
 */
export function refundedAmount(b: Pick<Booking, 'refund' | 'refunds'>): number {
  const ledger = b.refunds ? Object.values(b.refunds) : [];
  if (ledger.length) {
    return centsToEuros(ledger.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + r.amountCents, 0));
  }
  return b.refund?.status === 'succeeded' ? (b.refund.amount ?? 0) : 0;
}

/**
 * Сколько театр получил по брони и оставил себе, €.
 *
 * `paid` — оплачено, В ТОМ ЧИСЛЕ отменённые брони: отмена наличной/перевода
 * не означает, что деньги вернули (возврат там вручную), а у онлайн-оплаты
 * «оплачено после отмены» деньги тоже у театра. Частичный возврат Stripe
 * вычитается: раньше бронь с возвратом 10 € из 60 € шла в кассу целиком.
 * `refunded` — деньги вернули полностью: 0. Остальное (ожидает, истекла,
 * не оплачено) — 0.
 */
export function netPaidAmount(b: Pick<Booking, 'paymentStatus' | 'totalAmount' | 'refund' | 'refunds'>): number {
  if (b.paymentStatus !== 'paid') return 0;
  return Math.max(0, (b.totalAmount ?? 0) - refundedAmount(b));
}

function paidRevenue(list: readonly Booking[]): number {
  return list.reduce((sum, b) => sum + netPaidAmount(b), 0);
}

export function summarizeBookings(list: readonly Booking[]): BookingSummary {
  const snapshots = list.map(toSnapshot);
  return {
    bookings: countActiveBookings(snapshots),
    tickets:  sumOccupiedTickets(snapshots),
    revenue:  paidRevenue(list),
  };
}

/** Спектакль в админке: из каталога сайта или восстановленный по старым броням. */
export interface AdminShow {
  id:        string;
  title:     string;
  image?:    string;
  palette:   string;
  /** Мест в зале. */
  capacity:  number;
  /** «17 Сен 2026 · 20:00». */
  dateLabel: string;
}

export interface ShowStats extends BookingSummary {
  show: AdminShow | Show;
}

/** Инициалы спектакля для карточки без афиши. */
export function showGlyph(title: string): string {
  return title.replace(/[«»]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * Спектакли для карточек админки.
 *
 * Та же публикация, что на сайте: опубликованные спектакли каталога (в его
 * порядке) — всегда, даже без броней. Неопубликованная заготовка появляется,
 * только если по ней есть брони, а спектакль, которого в каталоге уже нет, —
 * из снимка старой брони (showTitle, дата). Раньше сюда шёл весь каталог
 * вместе с заготовками: «Летучий корабль» висел пустой карточкой, хотя на
 * сайте его не было, а брони удалённых спектаклей не попадали ни в одну карточку.
 */
export function adminShowList(catalog: readonly Show[], bookings: readonly Booking[]): AdminShow[] {
  const fromShow = (s: Show): AdminShow => ({
    id: s.id, title: s.title, image: s.image, palette: s.palette,
    capacity: s.totalSeats || THEATRE_CAPACITY,
    dateLabel: `${s.day} ${s.month} ${s.year} · ${s.time}`,
  });
  const withBookings = new Set(bookings.map(b => b.showId).filter(Boolean));
  const list = catalog
    .filter(s => s.published !== false || withBookings.has(s.id))
    .map(fromShow);

  const known = new Set(catalog.map(s => s.id));
  const orphans = new Map<string, AdminShow>();
  for (const b of bookings) {
    if (!b.showId || known.has(b.showId) || orphans.has(b.showId)) continue;
    orphans.set(b.showId, {
      id: b.showId, title: b.showTitle || b.showId, palette: 'var(--ph-1)',
      capacity: THEATRE_CAPACITY, dateLabel: [b.showDate, b.showTime].filter(Boolean).join(' · '),
    });
  }
  return [...list, ...orphans.values()];
}

/** Сводка по каждому спектаклю, в порядке списка. Брони связываются по showId. */
export function summarizeByShow(shows: readonly (AdminShow | Show)[], bookings: readonly Booking[]): ShowStats[] {
  return shows.map(show => ({
    show,
    ...summarizeBookings(bookings.filter(b => b.showId === show.id)),
  }));
}
