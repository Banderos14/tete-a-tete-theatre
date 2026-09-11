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

// Вместимость — бизнес-данные, подтверждённые владельцем проекта: зал на 50 мест.
// Закрепляем значение тестом, чтобы оно не уехало незаметно при рефакторинге,
// и следим, чтобы нигде не появилось второго источника правды.
describe('вместимость зала Théâtre Tête-à-Tête', () => {
  it('равна 50', () => {
    expect(THEATRE_CAPACITY).toBe(50);
  });

  it('объявлена ровно один раз', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const ROOT = resolve(__dirname, '../..');

    function walk(dir: string, out: string[] = []): string[] {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(e)) out.push(full);
      }
      return out;
    }

    const declarations = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'api'))]
      .filter(f => /THEATRE_CAPACITY\s*=\s*\d+/.test(readFileSync(f, 'utf8')))
      .map(f => f.replace(ROOT + '/', ''));

    expect(declarations).toEqual(['api/_lib/shows.ts']);
  });

  it('src/config/theatre.ts только реэкспортирует, а не объявляет своё значение', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const cfg = readFileSync(resolve(__dirname, '../../src/config/theatre.ts'), 'utf8');
    expect(cfg).toContain("export { THEATRE_CAPACITY } from '../../api/_lib/shows'");
    expect(cfg).not.toMatch(/THEATRE_CAPACITY\s*=/);
  });

  it('totalSeats в данных спектаклей не противоречит вместимости', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const data = readFileSync(resolve(__dirname, '../../src/data/shows.ts'), 'utf8');
    const values = [...data.matchAll(/totalSeats:\s*(\d+)/g)].map(m => Number(m[1]));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBeLessThanOrEqual(THEATRE_CAPACITY);
  });

  it('зал полон ровно на 50 билетах', () => {
    expect(checkCapacity(49, 1, THEATRE_CAPACITY)).toEqual({ allowed: true,  remaining: 1, soldOut: false });
    expect(checkCapacity(49, 2, THEATRE_CAPACITY)).toEqual({ allowed: false, remaining: 1, soldOut: false });
    expect(checkCapacity(50, 1, THEATRE_CAPACITY)).toEqual({ allowed: false, remaining: 0, soldOut: true });
  });

  it('бронь из 10 билетов (максимум на одну бронь) помещается в пустой зал', () => {
    expect(checkCapacity(0, 10, THEATRE_CAPACITY).allowed).toBe(true);
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
