// Сводка вкладки «Брони»: брони, билеты и касса — по спектаклю и в целом.
// Без React, поэтому проверяется юнит-тестом.
//
// «Броней» и «билетов» — только АКТИВНЫЕ, по тому же правилу, по которому
// сервер считает занятые места (occupiesCapacity в shared/domain/bookingRules):
// отменённая и протухшая бронь места не держит и в сводку не входит.
// Раньше сюда шёл весь список, и отменённая бронь на 3 билета продолжала
// показываться как «1 бронирование · 3 билета», хотя места уже были свободны.

import { countActiveBookings, sumOccupiedTickets } from '../../../shared/domain/bookingRules';
import type { Booking } from '../../types/booking';
import type { Show } from '../../types';

export interface BookingSummary {
  /** Активные брони. */
  bookings: number;
  /** Занятые места активных броней (у семейного пакета мест больше, чем билетов). */
  tickets: number;
  /** Фактически полученные деньги, € — см. paidRevenue. */
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
 * Касса — деньги, которые театр фактически получил: все брони с оплатой `paid`,
 * В ТОМ ЧИСЛЕ отменённые. Автовозвратов нет, и отмена оплаченной брони
 * (её может сделать только админ) не означает, что деньги вернули зрителю.
 * Учёт возвратов — отдельная задача; вычитать такие брони молча нельзя.
 */
function paidRevenue(list: readonly Booking[]): number {
  return list
    .filter(b => b.paymentStatus === 'paid')
    .reduce((sum, b) => sum + (b.totalAmount ?? 0), 0);
}

export function summarizeBookings(list: readonly Booking[]): BookingSummary {
  const snapshots = list.map(toSnapshot);
  return {
    bookings: countActiveBookings(snapshots),
    tickets:  sumOccupiedTickets(snapshots),
    revenue:  paidRevenue(list),
  };
}

export interface ShowStats extends BookingSummary {
  show: Show;
}

/** Сводка по каждому спектаклю каталога, в порядке каталога. */
export function summarizeByShow(shows: readonly Show[], bookings: readonly Booking[]): ShowStats[] {
  return shows.map(show => ({
    show,
    ...summarizeBookings(bookings.filter(b => b.showId === show.id)),
  }));
}
