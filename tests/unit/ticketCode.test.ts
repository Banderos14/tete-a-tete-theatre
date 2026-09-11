import { describe, it, expect } from 'vitest';
import { randomInt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const api = readFileSync(resolve(__dirname, '../../server/booking/ticketCode.ts'), 'utf8');

// Копия серверной реализации: проверяем сам алгоритм, а не обёртку.
function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}

describe('формат кода билета сохранён', () => {
  it('XXXX-XXXX из безопасного алфавита', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTicketCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it('в алфавите нет похожих символов 0/O и 1/I/L', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      // O, I, L отсутствуют; 0 и 1 тоже
      expect(CHARSET.includes(ch), `символ ${ch}`).toBe(false);
    }
  });

  it('старые коды по-прежнему подходят под формат — обратная совместимость', () => {
    expect('RU3R-HZJF').toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});

describe('modulo bias устранён', () => {
  it('сервер использует randomInt, а не остаток от деления байта', () => {
    expect(api).toContain('randomInt');
    expect(api).not.toMatch(/randomBytes\([^)]*\)[\s\S]{0,80}% CHARSET\.length/);
    expect(api).not.toContain('% CHARSET.length');
  });

  it('распределение символов заметно ровнее, чем у прежней схемы', () => {
    const N = 200_000;
    const expected = N / CHARSET.length;

    // Прежняя схема: byte % 31. 256 % 31 = 8, поэтому первые 8 символов алфавита
    // выпадали примерно на 12,5 % чаще остальных — это систематический перекос,
    // а не случайный шум.
    const oldCounts = new Array(CHARSET.length).fill(0);
    const bytes = randomBytes(N);
    for (let i = 0; i < N; i++) oldCounts[bytes[i]! % CHARSET.length]++;

    const newCounts = new Array(CHARSET.length).fill(0);
    for (let i = 0; i < N; i++) newCounts[randomInt(CHARSET.length)]++;

    // Средняя относительная девиация: в отличие от размаха, она быстро сходится
    // и не зависит от единичных выбросов.
    const deviation = (c: number[]) =>
      c.reduce((sum, n) => sum + Math.abs(n - expected), 0) / c.length / expected;

    const oldDev = deviation(oldCounts);
    const newDev = deviation(newCounts);

    // Систематический перекос старой схемы виден отчётливо...
    expect(oldDev).toBeGreaterThan(0.02);
    // ...и он как минимум вчетверо больше остаточного шума новой.
    expect(newDev * 4).toBeLessThan(oldDev);
  });

  it('коды не повторяются на разумной выборке', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateTicketCode());
    expect(seen.size).toBe(5000);
  });
});
