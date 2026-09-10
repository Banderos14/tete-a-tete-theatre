import { describe, it, expect } from 'vitest';
import { sumOccupiedTickets, checkCapacity } from '../../api/_lib/bookingRules.js';
import { THEATRE_CAPACITY } from '../../api/_lib/shows.js';

describe('sumOccupiedTickets', () => {
  it('суммирует билеты активных броней', () => {
    expect(sumOccupiedTickets([
      { status: 'pending',   paymentStatus: 'not_paid',          ticketsCount: 2 },
      { status: 'confirmed', paymentStatus: 'paid',              ticketsCount: 3 },
      { status: 'pending',   paymentStatus: 'awaiting_transfer', ticketsCount: 1 },
      { status: 'attended',  paymentStatus: 'paid',              ticketsCount: 4 },
    ])).toBe(10);
  });

  it('отменённые брони освобождают вместимость', () => {
    expect(sumOccupiedTickets([
      { status: 'confirmed', paymentStatus: 'paid',     ticketsCount: 5 },
      { status: 'cancelled', paymentStatus: 'not_paid', ticketsCount: 5 },
    ])).toBe(5);
  });

  it('протухшие переводы освобождают вместимость', () => {
    expect(sumOccupiedTickets([
      { status: 'confirmed', paymentStatus: 'paid',    ticketsCount: 5 },
      { status: 'cancelled', paymentStatus: 'expired', ticketsCount: 7 },
      { status: 'pending',   paymentStatus: 'expired', ticketsCount: 3 },
    ])).toBe(5);
  });

  it('бронь без ticketsCount считается за один билет', () => {
    expect(sumOccupiedTickets([{ status: 'pending', paymentStatus: 'not_paid' }])).toBe(1);
  });

  it('мусорный ticketsCount не уменьшает счёт', () => {
    expect(sumOccupiedTickets([
      { status: 'pending', paymentStatus: 'not_paid', ticketsCount: -5 },
      { status: 'pending', paymentStatus: 'not_paid', ticketsCount: 0 },
    ])).toBe(2);
  });

  it('пустой список — ноль', () => {
    expect(sumOccupiedTickets([])).toBe(0);
  });
});

describe('checkCapacity', () => {
  it('пропускает, пока мест хватает', () => {
    expect(checkCapacity(0, 1, 100)).toEqual({ allowed: true, remaining: 100, soldOut: false });
    expect(checkCapacity(50, 10, 100)).toEqual({ allowed: true, remaining: 50, soldOut: false });
  });

  it('последний билет продаётся', () => {
    expect(checkCapacity(99, 1, 100)).toEqual({ allowed: true, remaining: 1, soldOut: false });
  });

  it('запрос сверх остатка отклоняется', () => {
    expect(checkCapacity(99, 2, 100)).toEqual({ allowed: false, remaining: 1, soldOut: false });
  });

  it('полный зал — sold out', () => {
    expect(checkCapacity(100, 1, 100)).toEqual({ allowed: false, remaining: 0, soldOut: true });
  });

  it('переполнение из прошлого не даёт отрицательный остаток', () => {
    expect(checkCapacity(120, 1, 100)).toEqual({ allowed: false, remaining: 0, soldOut: true });
  });

  it('капасити берётся из единого источника правды', () => {
    expect(THEATRE_CAPACITY).toBeGreaterThan(0);
    expect(checkCapacity(THEATRE_CAPACITY, 1, THEATRE_CAPACITY).soldOut).toBe(true);
  });
});

// Транзакционная сериализация — гарантия Firestore, здесь проверяется её следствие:
// если два запроса применяются последовательно к одному состоянию, второй обязан
// увидеть результат первого и получить отказ.
describe('последовательные брони не превышают вместимость', () => {
  it('второй запрос видит первый и отклоняется', () => {
    const capacity = 10;
    const existing = [{ status: 'confirmed', paymentStatus: 'paid', ticketsCount: 8 }];

    const first = checkCapacity(sumOccupiedTickets(existing), 2, capacity);
    expect(first.allowed).toBe(true);

    existing.push({ status: 'pending', paymentStatus: 'not_paid', ticketsCount: 2 });

    const second = checkCapacity(sumOccupiedTickets(existing), 1, capacity);
    expect(second.allowed).toBe(false);
    expect(second.soldOut).toBe(true);
  });
});
