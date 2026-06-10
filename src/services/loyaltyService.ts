import type { Booking } from '../types/booking';
import { computedIsAttended } from './attendanceService';

const REWARD_INTERVAL = 5;

// 1 посещение = 1 attended booking, независимо от ticketsCount.
export function getUserAttendedCount(bookings: Booking[]): number {
  return bookings.filter(computedIsAttended).length;
}

// Сколько бонусов уже использовано (брони с loyaltyDiscountApplied = true).
export function getUsedRewardCount(bookings: Booking[]): number {
  return bookings.filter(b => b.loyaltyDiscountApplied === true).length;
}

// Бонус доступен, если Math.floor(attended / 5) > usedCount.
// Т.е. каждые 5 посещений даёт одну скидку.
export function hasAvailableLoyaltyReward(bookings: Booking[]): boolean {
  const attended = getUserAttendedCount(bookings);
  if (attended < REWARD_INTERVAL) return false;
  return Math.floor(attended / REWARD_INTERVAL) > getUsedRewardCount(bookings);
}

// Скидка 50%, округление вниз.
export function calculateLoyaltyDiscount(totalAmount: number): number {
  return Math.floor(totalAmount / 2);
}

// Порог следующего бонуса (для сообщений вида "следующий подарок после N посещений").
export function nextRewardThreshold(bookings: Booking[]): number {
  const used = getUsedRewardCount(bookings);
  return (used + 1) * REWARD_INTERVAL;
}

// Прогресс точек внутри текущего 5-цикла (0–5).
// Учитывает использованные бонусы, чтобы точки не "застревали" на 5/5 после использования.
export function cycleProgress(bookings: Booking[]): number {
  const attended = getUserAttendedCount(bookings);
  if (hasAvailableLoyaltyReward(bookings)) return REWARD_INTERVAL;
  const used = getUsedRewardCount(bookings);
  return attended - used * REWARD_INTERVAL;
}
