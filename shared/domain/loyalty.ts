// Программа лояльности: посетите 5 спектаклей — 6-й билет со скидкой 50 %.
//
// Изоморфный модуль: одну и ту же формулу применяют транзакция создания брони
// на сервере (авторитетная цена) и кабинет / форма брони (только показ).
// Никаких хранимых счётчиков: прогресс каждый раз вычисляется из реальных
// броней пользователя, поэтому существующим пользователям миграция не нужна.
//
// Правила:
//   • посещение — ТОЛЬКО реальный проход (status === 'attended', ставит check-in);
//     оплата, бронь, отмена, протухание и неявка посещением не являются;
//   • один спектакль (сеанс) = одно посещение, сколько бы броней и мест
//     ни было у аккаунта на этот вечер;
//   • каждые 5 посещений дают одну скидку 50 % на ОДИН билет следующей брони;
//   • скидка считается использованной, пока бронь с ней действует. Отменили
//     или бронь протухла до спектакля — скидка возвращается.

import { isBookingAttended, occupiesCapacity } from './bookingRules.js';
import { parisDateKey } from './showTime.js';

export const LOYALTY_VISITS_PER_REWARD = 5;

export interface LoyaltyBooking {
  status:        string;
  paymentStatus: string;
  showId?:       string;
  /** Начало сеанса брони (мс UTC); null — неизвестно у очень старой брони. */
  startMs:       number | null;
  loyaltyDiscountApplied?: boolean;
}

export interface LoyaltySummary {
  /** Посещённые спектакли — уникальные сеансы с реальным проходом. */
  visits:    number;
  /** Скидки, заработанные всего: floor(visits / 5). */
  earned:    number;
  /** Скидки, занятые действующими бронями. */
  used:      number;
  /** Можно применить скидку к следующей брони. */
  available: boolean;
  /** Точки текущего цикла: 0…5; 5 — скидка готова. */
  progress:  number;
  /** Сколько посещений осталось до скидки (0, если она доступна). */
  remaining: number;
}

/** Ключ сеанса: спектакль + день по Парижу — та же identity, что у проверки на входе. */
function visitKey(b: LoyaltyBooking): string {
  const day = b.startMs === null ? 'unknown' : parisDateKey(b.startMs);
  return `${b.showId ?? ''}|${day}`;
}

export function loyaltySummary(bookings: readonly LoyaltyBooking[]): LoyaltySummary {
  const visitKeys = new Set(bookings.filter(b => isBookingAttended(b)).map(visitKey));
  const visits = visitKeys.size;
  const earned = Math.floor(visits / LOYALTY_VISITS_PER_REWARD);
  // Бронь со скидкой занимает её, пока действует (отменённая/протухшая — нет).
  const used = bookings.filter(b => b.loyaltyDiscountApplied === true && occupiesCapacity(b)).length;
  const available = earned > used;

  const progress = available
    ? LOYALTY_VISITS_PER_REWARD
    : Math.min(LOYALTY_VISITS_PER_REWARD, Math.max(0, visits - used * LOYALTY_VISITS_PER_REWARD));

  return {
    visits, earned, used, available, progress,
    remaining: available ? 0 : LOYALTY_VISITS_PER_REWARD - progress,
  };
}

/** Скидка на ОДИН билет брони: 50 % его цены, округление вниз. */
export function loyaltyDiscountForTicket(unitPrice: number): number {
  return Math.floor(unitPrice / 2);
}
