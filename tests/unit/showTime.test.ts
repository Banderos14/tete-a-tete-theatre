import { describe, it, expect } from 'vitest';
import {
  parisWallClockToUtcMs,
  parseShowStartUtcMs,
  showEndUtcMs,
  hasShowEnded,
  hasShowStarted,
  THEATRE_TIMEZONE,
} from '../../shared/domain/showTime.js';

// Проверяем, что настенное парижское время переводится в правильный абсолютный
// момент независимо от таймзоны процесса и с корректным учётом DST.
function parisWallClockOf(utcMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: THEATRE_TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utcMs));
}

describe('parisWallClockToUtcMs', () => {
  it('летом Париж = UTC+2', () => {
    // 14 июня 2026, 19:00 по Парижу = 17:00 UTC
    const ms = parisWallClockToUtcMs(2026, 5, 14, 19, 0);
    expect(new Date(ms).toISOString()).toBe('2026-06-14T17:00:00.000Z');
  });

  it('зимой Париж = UTC+1', () => {
    // 14 января 2026, 19:00 по Парижу = 18:00 UTC
    const ms = parisWallClockToUtcMs(2026, 0, 14, 19, 0);
    expect(new Date(ms).toISOString()).toBe('2026-01-14T18:00:00.000Z');
  });

  it('корректен в день перехода на зимнее время', () => {
    // Переход 2026: последнее воскресенье октября — 25.10.2026.
    // 20:00 по Парижу в этот день уже зимнее время (UTC+1).
    const ms = parisWallClockToUtcMs(2026, 9, 25, 20, 0);
    expect(new Date(ms).toISOString()).toBe('2026-10-25T19:00:00.000Z');
  });

  it('корректен в день перехода на летнее время', () => {
    // Переход 2026: последнее воскресенье марта — 29.03.2026.
    const ms = parisWallClockToUtcMs(2026, 2, 29, 20, 0);
    expect(new Date(ms).toISOString()).toBe('2026-03-29T18:00:00.000Z');
  });

  it('round-trip: обратное форматирование даёт исходное настенное время', () => {
    for (const [y, m, d, h] of [[2026, 0, 5, 9], [2026, 5, 14, 19], [2026, 11, 31, 23]] as const) {
      const ms = parisWallClockToUtcMs(y, m, d, h, 0);
      expect(parisWallClockOf(ms)).toBe(
        `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}, ${String(h).padStart(2, '0')}:00`,
      );
    }
  });
});

describe('parseShowStartUtcMs', () => {
  it('разбирает формат «14 Июн 2026» + «19:00»', () => {
    expect(new Date(parseShowStartUtcMs('14 Июн 2026', '19:00')!).toISOString())
      .toBe('2026-06-14T17:00:00.000Z');
  });

  it('поддерживает все 12 месяцев', () => {
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    for (const m of months) {
      expect(parseShowStartUtcMs(`15 ${m} 2026`, '20:00')).not.toBeNull();
    }
  });

  it('возвращает null на мусоре', () => {
    expect(parseShowStartUtcMs('', '19:00')).toBeNull();
    expect(parseShowStartUtcMs('14 Хрю 2026', '19:00')).toBeNull();
    expect(parseShowStartUtcMs('14 Июн', '19:00')).toBeNull();
    expect(parseShowStartUtcMs('14 Июн 2026', 'нет')).toBeNull();
    expect(parseShowStartUtcMs('99 Июн 2026', '19:00')).toBeNull();
  });
});

describe('окончание спектакля', () => {
  const start = parseShowStartUtcMs('14 Июн 2026', '19:00')!;

  it('буфер ровно 2 часа', () => {
    expect(showEndUtcMs(start) - start).toBe(2 * 60 * 60 * 1000);
  });

  it('hasShowStarted / hasShowEnded учитывают границы', () => {
    expect(hasShowStarted(start, start - 1)).toBe(false);
    expect(hasShowStarted(start, start)).toBe(true);
    expect(hasShowEnded(start, start + 2 * 60 * 60 * 1000)).toBe(false);
    expect(hasShowEnded(start, start + 2 * 60 * 60 * 1000 + 1)).toBe(true);
  });
});

// ── TTT-12: единый расчёт посещаемости у клиента и сервера ──────────────────
import { isBookingAttended } from '../../shared/domain/bookingRules.js';

describe('isBookingAttended — одна реализация для клиента и сервера', () => {
  // 14 июня 2026, 19:00 по Парижу = 17:00 UTC, конец = 19:00 UTC
  const start = parseShowStartUtcMs('14 Июн 2026', '19:00')!;
  const end   = showEndUtcMs(start);
  const paid  = { status: 'confirmed', paymentStatus: 'paid' };

  it('до окончания спектакля бронь не посещена', () => {
    expect(isBookingAttended(paid, start, end - 1)).toBe(false);
  });

  it('после окончания — посещена', () => {
    expect(isBookingAttended(paid, start, end + 1)).toBe(true);
  });

  it('момент не зависит от таймзоны процесса — это абсолютный UTC', () => {
    expect(new Date(end).toISOString()).toBe('2026-06-14T19:00:00.000Z');
  });

  it('зимой то же правило даёт другое смещение (DST учтён)', () => {
    const winterStart = parseShowStartUtcMs('14 Янв 2026', '19:00')!;
    expect(new Date(showEndUtcMs(winterStart)).toISOString()).toBe('2026-01-14T20:00:00.000Z');
  });

  it('неоплаченная и неподтверждённая бронь никогда не посещена', () => {
    expect(isBookingAttended({ status: 'pending',   paymentStatus: 'paid' },     start, end + 1)).toBe(false);
    expect(isBookingAttended({ status: 'confirmed', paymentStatus: 'not_paid' }, start, end + 1)).toBe(false);
    expect(isBookingAttended({ status: 'cancelled', paymentStatus: 'paid' },     start, end + 1)).toBe(false);
  });

  it('явный статус attended важнее расчёта', () => {
    expect(isBookingAttended({ status: 'attended', paymentStatus: 'not_paid' }, null, 0)).toBe(true);
  });

  it('без известного времени начала расчётного посещения не бывает', () => {
    expect(isBookingAttended(paid, null, Date.now())).toBe(false);
  });
});

describe('дублирующих реализаций разбора времени спектакля больше нет', () => {
  it('attendanceService не строит дату через new Date(year, month, ...)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../src/services/attendanceService.ts'), 'utf8');
    expect(src).not.toMatch(/new Date\(\s*year/);
    expect(src).not.toContain('MONTH_RU');
  });

  it('create-booking не содержит собственной таблицы месяцев', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../api/create-booking.ts'), 'utf8');
    expect(src).not.toContain("'Янв': 0");
    expect(src).not.toMatch(/hour \+ 2/);
  });
});
