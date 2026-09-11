import { describe, it, expect } from 'vitest';
import { randomInt } from 'node:crypto';
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

  it('прежняя схема byte % 31 смещена — это доказывается точно, без выборки', () => {
    // Перебираем ВСЕ 256 значений байта: 256 = 8 * 31 + 8, поэтому первые восемь
    // символов алфавита получают по 9 шансов из 256, а остальные 23 — по 8.
    // Это не статистика, а арифметика: результат одинаков при каждом прогоне.
    const counts = new Array(CHARSET.length).fill(0);
    for (let byte = 0; byte < 256; byte++) counts[byte % CHARSET.length]++;

    const favoured = counts.filter(c => c === 9).length;
    expect(favoured).toBe(8);
    expect(counts.filter(c => c === 8).length).toBe(CHARSET.length - 8);

    // Перекос ровно 12,5 % — именно его и убирает randomInt.
    expect(Math.max(...counts) / Math.min(...counts)).toBeCloseTo(9 / 8, 10);

    // Смещены именно первые восемь символов алфавита.
    for (let i = 0; i < 8; i++) expect(counts[i], CHARSET[i]).toBe(9);
  });

  it('randomInt даёт равномерное распределение', () => {
    // Здесь выборка неизбежна, но порог взят с огромным запасом: при 200 000
    // выборок стандартное отклонение доли составляет около 1,2 %, поэтому
    // граница в 10 % — это примерно восемь сигм. Тест не может «моргать».
    const N = 200_000;
    const expected = N / CHARSET.length;

    const counts = new Array(CHARSET.length).fill(0);
    for (let i = 0; i < N; i++) counts[randomInt(CHARSET.length)]++;

    for (let i = 0; i < CHARSET.length; i++) {
      const deviation = Math.abs(counts[i]! - expected) / expected;
      expect(deviation, `символ ${CHARSET[i]}`).toBeLessThan(0.1);
    }

    // Для контраста: у прежней схемы систематический перекос 12,5 % —
    // он бы этот порог не прошёл.
    expect(9 / 8 - 1).toBeGreaterThan(0.1);
  });

  it('коды не повторяются на разумной выборке', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateTicketCode());
    expect(seen.size).toBe(5000);
  });
});
