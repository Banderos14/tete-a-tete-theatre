import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_COMMENT_LEN, MAX_PHONE_LEN, MIN_PHONE_LEN, MAX_CANCEL_COMMENT_LEN } from '../../shared/contracts/limits.js';

const ROOT = resolve(__dirname, '../..');
// Проверка ввода живёт в серверном слое, а не в тонком handler'е.
const createBooking = readFileSync(resolve(ROOT, 'server/booking/booking.validation.ts'), 'utf8');
const cancelBooking = readFileSync(resolve(ROOT, 'server/booking/cancellation.service.ts'), 'utf8');
const formStep      = readFileSync(resolve(ROOT, 'src/components/ui/BookingModal/BookingFormStep.tsx'), 'utf8');

describe('лимиты объявлены один раз', () => {
  it('значения разумные и далеки от лимита документа Firestore в 1 МБ', () => {
    expect(MAX_COMMENT_LEN).toBeGreaterThan(100);
    expect(MAX_COMMENT_LEN).toBeLessThanOrEqual(5000);
    expect(MIN_PHONE_LEN).toBeLessThan(MAX_PHONE_LEN);
    expect(MAX_CANCEL_COMMENT_LEN).toBeLessThanOrEqual(MAX_COMMENT_LEN);
  });

  it('сервер импортирует общие константы, а не дублирует их', () => {
    expect(createBooking).toContain("from '../../shared/contracts/limits.js'");
    expect(createBooking).not.toMatch(/const MAX_COMMENT_LEN\s*=/);
    expect(cancelBooking).toContain("from '../../shared/contracts/limits.js'");
    expect(cancelBooking).not.toMatch(/const MAX_CANCEL_COMMENT_LEN\s*=/);
  });

  it('форма импортирует ту же константу — клиент и сервер не разъедутся', () => {
    expect(formStep).toContain("from '../../../../shared/contracts/limits'");
    expect(formStep).toContain('maxLength={MAX_COMMENT_LEN}');
  });
});

describe('серверная валидация ввода', () => {
  it('слишком длинный комментарий отклоняется', () => {
    expect(createBooking).toMatch(/comment\.length > MAX_COMMENT_LEN/);
    expect(createBooking).toContain('comment must be at most');
  });

  it('комментарий дополнительно обрезается перед записью', () => {
    expect(createBooking).toContain('.trim().slice(0, MAX_COMMENT_LEN)');
  });

  it('телефон проверяется и по минимуму, и по максимуму', () => {
    expect(createBooking).toMatch(/phoneValue\.length < MIN_PHONE_LEN \|\| phoneValue\.length > MAX_PHONE_LEN/);
  });

  it('комментарий отмены обрезается', () => {
    expect(cancelBooking).toContain('.slice(0, MAX_CANCEL_COMMENT_LEN)');
  });

  it('количество билетов ограничено сверху', () => {
    expect(createBooking).toContain('MAX_TICKETS_PER_BOOKING');
    expect(createBooking).toMatch(/ticketsCount > MAX_TICKETS_PER_BOOKING/);
  });

  it('тело запроса ограничено по размеру', () => {
    const http = readFileSync(resolve(ROOT, 'server/shared/http.ts'), 'utf8');
    expect(http).toContain('MAX_BODY_BYTES');
  });
});

describe('showId не ищется по прототипу', () => {
  it('validateCreateBooking проверяет собственные ключи каталога', () => {
    // `showId in SHOWS` пропускал 'constructor' и '__proto__' дальше первой
    // проверки — отсекались они только ниже, по отсутствию tickets.
    expect(createBooking).toContain('Object.hasOwn(SHOWS, showId)');
    expect(createBooking).not.toMatch(/showId in SHOWS/);
  });
});
