// Экран проверки: выбор текущего сеанса, время прохода, поведение кнопок.

import { describe, it, expect } from 'vitest';
import { checkinShowOptions, currentShowId, formatAttendedAt } from '../../src/pages/TicketCheckPage/checkinShows';
import { screenSource } from '../helpers/serverSource.js';

const page = screenSource('src/pages/TicketCheckPage');

describe('сеанс по умолчанию в поиске', () => {
  const options = checkinShowOptions();

  it('сеансы идут по времени начала', () => {
    const starts = options.map(o => o.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('вечером спектакля выбран именно он, а не следующий', () => {
    const first = options[0]!;
    expect(currentShowId(options, first.startMs + 30 * 60 * 1000)).toBe(first.id);
  });

  it('на следующий день после спектакля — следующий сеанс', () => {
    const [first, second] = options;
    expect(currentShowId(options, first!.startMs + 24 * 60 * 60 * 1000)).toBe(second!.id);
  });

  it('после конца сезона — последний сеанс, а не пустота', () => {
    const last = options[options.length - 1]!;
    expect(currentShowId(options, last.startMs + 365 * 24 * 60 * 60 * 1000)).toBe(last.id);
  });
});

describe('время прохода', () => {
  it('показывается по Парижу', () => {
    // 17 Сен 2026 17:42 UTC = 19:42 в Париже (летнее время).
    expect(formatAttendedAt(Date.UTC(2026, 8, 17, 17, 42))).toBe('19:42, 17.09');
    expect(formatAttendedAt(null)).toBeNull();
  });
});

describe('скорость у входа', () => {
  it('оплаченный билет проводится одним нажатием — без диалога подтверждения', () => {
    expect(page).toContain('onMarkAttended={() => { void check.markAttended(); }}');
    expect(page).not.toContain("askConfirm('attended')");
  });

  it('«Принять XX € и пропустить» — одно нажатие, сумма на кнопке из брони', () => {
    expect(page).toContain('onPayAndCheckIn={() => { void check.payAndCheckIn(); }}');
    expect(page).toContain('`Принять ${b.totalAmount} € и пропустить`');
    // Второстепенное «только принять оплату» по-прежнему переспрашивает.
    expect(page).toContain("askConfirm('cash')");
  });

  it('после результата камера открывается сразу для следующего зрителя', () => {
    expect(page).toMatch(/function handleNext\(\) \{\s*handleReset\(\);\s*check\.beginScanning\(\);/);
    expect(page).toContain('Сканировать следующий');
  });

  it('неоплаченный билет «на месте» не рисуется зелёным «действителен»', () => {
    expect(page).toMatch(/variant="cash"/);
    expect(page).toContain('НЕ ОПЛАЧЕНО');
  });

  it('есть поиск без QR: код, имя, e-mail, телефон', () => {
    expect(page).toContain('BookingSearchPanel');
    expect(page).toContain('normalizeTicketCodeInput');
    expect(page).toContain('filterBookings');
  });

  it('в экране нет эмодзи — только иконки', () => {
    expect(page).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
