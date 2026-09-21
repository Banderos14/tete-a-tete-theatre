import { describe, it, expect } from 'vitest';
import { decideRateLimit } from '../../server/shared/rateLimit.js';
import { projectSource } from '../helpers/serverSource.js';

const HOUR = 60 * 60 * 1000;

describe('decideRateLimit', () => {
  it('первый запрос в пустом окне разрешён', () => {
    expect(decideRateLimit(null, 5, HOUR, 1000)).toEqual({ allowed: true, nextCount: 1, windowStartMs: 1000 });
  });

  it('считает запросы внутри окна', () => {
    const r = decideRateLimit({ count: 3, windowStartMs: 1000 }, 5, HOUR, 1000 + 60_000);
    expect(r).toEqual({ allowed: true, nextCount: 4, windowStartMs: 1000 });
  });

  it('на лимите отказывает и счётчик не растёт', () => {
    const r = decideRateLimit({ count: 5, windowStartMs: 1000 }, 5, HOUR, 1000 + 60_000);
    expect(r.allowed).toBe(false);
    expect(r.nextCount).toBe(5);
  });

  it('после окончания окна счётчик сбрасывается', () => {
    const r = decideRateLimit({ count: 999, windowStartMs: 1000 }, 5, HOUR, 1000 + HOUR);
    expect(r).toEqual({ allowed: true, nextCount: 1, windowStartMs: 1000 + HOUR });
  });

  it('граница окна: за миллисекунду до сброса всё ещё отказ', () => {
    const r = decideRateLimit({ count: 5, windowStartMs: 1000 }, 5, HOUR, 1000 + HOUR - 1);
    expect(r.allowed).toBe(false);
  });

  it('лимит 1 пропускает ровно один запрос', () => {
    expect(decideRateLimit(null, 1, HOUR, 0).allowed).toBe(true);
    expect(decideRateLimit({ count: 1, windowStartMs: 0 }, 1, HOUR, 10).allowed).toBe(false);
  });
});

describe('письма-билеты: отправляет только сервер', () => {
  it('эндпоинта «отправить произвольное письмо» больше нет', () => {
    expect(() => projectSource('api/send-email.ts')).toThrow();
  });

  it('повторная отправка билета ограничена по администратору', () => {
    const router = projectSource('server/admin/adminBooking.service.ts');
    expect(router).toContain('consumeRateLimit');
    expect(router).toContain('ticket-resend:${adminUid}');
    expect(router).toContain("tooManyRequests('Too many resends");
  });
});
