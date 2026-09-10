import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_COMMENT_LEN, MAX_PHONE_LEN, MIN_PHONE_LEN, MAX_CANCEL_COMMENT_LEN } from '../../api/_lib/limits.js';

const ROOT = resolve(__dirname, '../..');
const createBooking = readFileSync(resolve(ROOT, 'api/create-booking.ts'), 'utf8');
const cancelBooking = readFileSync(resolve(ROOT, 'api/cancel-booking.ts'), 'utf8');
const formStep      = readFileSync(resolve(ROOT, 'src/components/ui/BookingModal/BookingFormStep.tsx'), 'utf8');

describe('лимиты объявлены один раз', () => {
  it('значения разумные и далеки от лимита документа Firestore в 1 МБ', () => {
    expect(MAX_COMMENT_LEN).toBeGreaterThan(100);
    expect(MAX_COMMENT_LEN).toBeLessThanOrEqual(5000);
    expect(MIN_PHONE_LEN).toBeLessThan(MAX_PHONE_LEN);
    expect(MAX_CANCEL_COMMENT_LEN).toBeLessThanOrEqual(MAX_COMMENT_LEN);
  });

  it('сервер импортирует общие константы, а не дублирует их', () => {
    expect(createBooking).toContain("from './_lib/limits.js'");
    expect(createBooking).not.toMatch(/const MAX_COMMENT_LEN\s*=/);
    expect(cancelBooking).toContain("from './_lib/limits.js'");
    expect(cancelBooking).not.toMatch(/const MAX_CANCEL_COMMENT_LEN\s*=/);
  });

  it('форма импортирует ту же константу — клиент и сервер не разъедутся', () => {
    expect(formStep).toContain("from '../../../../api/_lib/limits'");
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
    const http = readFileSync(resolve(ROOT, 'api/_lib/http.ts'), 'utf8');
    expect(http).toContain('MAX_BODY_BYTES');
  });
});
