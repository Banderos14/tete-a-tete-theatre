import { describe, it, expect } from 'vitest';
import { decideRateLimit } from '../../server/shared/rateLimit.js';
import { endpointSource } from '../helpers/serverSource.js';

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

describe('/api/send-email: авторизация и привязка к брони', () => {
  const src = endpointSource('api/send-email.ts');

  it('анонимная отправка невозможна для любого типа письма', () => {
    expect(src).toContain('requires Authorization: Bearer <token>');
    expect(src).toMatch(/if \(!idToken\) throw unauthorized\(/);
  });

  it('booking-confirmation требует ticketCode и проверяет владение бронью', () => {
    expect(src).toContain('ticketCode is required for booking-confirmation');
    expect(src).toContain('ownsBookingWithTicketCode');
    expect(src).toContain("where('ticketCode', '==', ticketCode)");
    expect(src).toContain("?.userId === uid");
  });

  it('booking-status / payment-paid остаются admin-only', () => {
    expect(src).toContain("ADMIN_ONLY_TYPES: readonly EmailType[] = ['booking-status', 'payment-paid']");
    expect(src).toContain('ADMIN_ONLY_TYPES.includes(type) && !isAdmin');
    expect(src).toContain('is admin-only');
  });

  it('лимит применяется к вызывающему и отвечает 429 с Retry-After', () => {
    expect(src).toContain('consumeRateLimit');
    expect(src).toContain('Too many emails, try again later');
    expect(src).toContain("'Retry-After'");
  });

  it('у администратора лимит выше — рассылка должна проходить целиком', () => {
    expect(src).toMatch(/ADMIN_EMAIL_LIMIT_PER_HOUR\s*=\s*(\d+)/);
    const user  = Number(/USER_EMAIL_LIMIT_PER_HOUR\s*=\s*(\d+)/.exec(src)![1]);
    const admin = Number(/ADMIN_EMAIL_LIMIT_PER_HOUR\s*=\s*(\d+)/.exec(src)![1]);
    expect(admin).toBeGreaterThan(user);
  });
});

describe('фронтенд присылает ticketCode', () => {
  it('sendBookingConfirmationEmail передаёт код билета', () => {
    const src = endpointSource('src/services/email/index.ts');
    expect(src).toMatch(/type: 'booking-confirmation'[\s\S]{0,200}ticketCode: data\.ticketCode/);
  });
});
