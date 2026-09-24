// Авторизация платёжных endpoint'ов — негативные проверки с НАСТОЯЩИМ
// server/shared/auth.ts: токен проверяется (verifyIdToken подменён), роль
// читается из Firestore (in-memory модель). Скрытая кнопка в интерфейсе
// защитой не считается — сервер должен отказать сам, не трогая ни бронь,
// ни Stripe.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryFirestore } from '../helpers/memoryFirestore';

let store = new MemoryFirestore();

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '<ts>', delete: () => '<delete>' },
  Timestamp:  { fromMillis: (ms: number) => ({ seconds: ms / 1000, toMillis: () => ms }) },
  getFirestore: () => store,
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    // Токен вида tok-<uid>; всё остальное — недействительный токен.
    verifyIdToken: async (t: string) => {
      if (!t.startsWith('tok-')) throw new Error('invalid token');
      return { uid: t.slice(4) };
    },
    getUser: async () => ({}),
  }),
}));
vi.mock('../../server/shared/firebaseAdmin.js', () => ({ getAdminApp: () => ({}) }));

const stripeCalls: string[] = [];
vi.mock('../../server/payments/stripe.client.js', () => {
  const spy = (name: string) => async () => { stripeCalls.push(name); throw new Error('Stripe must not be called'); };
  return {
    getStripe: () => ({ checkout: { sessions: { create: spy('create'), retrieve: spy('retrieve'), expire: spy('expire') } } }),
    isOnlinePaymentEnabled: () => true,
    expectedLivemode:       () => false,
  };
});

const { default: adminHandler }  = await import('../../api/admin-booking.js');
const { default: createHandler } = await import('../../api/create-booking.js');
const { default: cancelHandler } = await import('../../api/cancel-booking.js');

function fakeReq(method: string, body: Record<string, unknown>, token: string | null): IncomingMessage {
  const payload = JSON.stringify(body);
  const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
  const req = {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), origin: 'https://www.theatre-teteatete.fr' },
    on(event: string, cb: (chunk?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      if (event === 'end') queueMicrotask(() => { listeners.data?.forEach(f => f(payload)); cb(); });
      return req;
    },
    destroy() {},
  };
  return req as unknown as IncomingMessage;
}

async function call(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  body: Record<string, unknown>, token: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = {
    status: 0, raw: '',
    writeHead(status: number) { res.status = status; return res; },
    end(chunk?: string) { res.raw = chunk ?? ''; },
  };
  await handler(fakeReq('POST', body, token), res as unknown as ServerResponse);
  return { status: res.status, body: res.raw ? JSON.parse(res.raw) as Record<string, unknown> : {} };
}

const OWNER = 'owner';
const booking = (id: string) => store.peek('bookings', id)!;

beforeEach(() => {
  store = new MemoryFirestore();
  stripeCalls.length = 0;
  store.seed('users', OWNER,      { role: 'user' });
  store.seed('users', 'intruder', { role: 'user' });
  store.seed('users', 'admin-1',  { role: 'admin' });
  store.seed('bookings', 'awaiting', {
    userId: OWNER, showId: 'shutka', showDate: '02 Окт 2026', showTime: '20:00',
    status: 'pending', paymentMethod: 'online', paymentStatus: 'awaiting_online',
    stripeCheckoutSessionId: 'cs_test_owner', ticketsCount: 2, totalAmount: 60, ticketCode: 'ABCD-2345',
  });
  store.seed('bookings', 'paid', {
    userId: OWNER, showId: 'shutka', showDate: '02 Окт 2026', showTime: '20:00',
    status: 'confirmed', paymentMethod: 'online', paymentStatus: 'paid',
    stripeCheckoutSessionId: 'cs_test_paid', stripePaymentIntentId: 'pi_test_paid',
    ticketsCount: 2, totalAmount: 60, ticketCode: 'EFGH-2345',
  });
});

describe('/api/admin-booking: только администратор, проверка на сервере', () => {
  const actions: Array<Record<string, unknown>> = [
    { action: 'cancel',        bookingId: 'paid' },
    { action: 'cancel',        bookingId: 'awaiting' },
    { action: 'mark_unpaid',   bookingId: 'paid' },
    { action: 'delete',        bookingId: 'paid' },
    { action: 'resend_ticket', bookingId: 'paid' },
    { action: 'mark_paid',     ticketCode: 'ABCD-2345' },
    { action: 'inspect',       ticketCode: 'EFGH-2345' },
  ];

  it('без токена — 401 на любое действие, брони и Stripe не тронуты', async () => {
    for (const body of actions) expect((await call(adminHandler, body, null)).status).toBe(401);
    expect(booking('paid')).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(stripeCalls).toEqual([]);
  });

  it('недействительный токен — 401', async () => {
    expect((await call(adminHandler, actions[0]!, 'forged')).status).toBe(401);
  });

  it('обычный пользователь (даже владелец брони) — 403, без финансовых подробностей', async () => {
    for (const body of actions) {
      const r = await call(adminHandler, body, `tok-${OWNER}`);
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toMatch(/pi_test|cs_test|stripe/i);
    }
    expect(booking('paid')).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(booking('awaiting')).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_online' });
    expect(stripeCalls).toEqual([]);
  });

  it('администратор проходит проверку роли — и получает бизнес-отказ refund_required', async () => {
    const r = await call(adminHandler, { action: 'cancel', bookingId: 'paid' }, 'tok-admin-1');
    expect(r).toMatchObject({ status: 409, body: { reason: 'refund_required' } });
  });
});

describe('/api/create-booking resume_checkout: только своя бронь', () => {
  it('без токена — 401, Stripe не вызывается', async () => {
    const r = await call(createHandler, { action: 'resume_checkout', bookingId: 'awaiting' }, null);
    expect(r.status).toBe(401);
    expect(stripeCalls).toEqual([]);
  });

  it('чужая бронь — 404 как несуществующая: ни ссылки, ни состояния, ни Stripe', async () => {
    for (const id of ['awaiting', 'paid']) {
      const r = await call(createHandler, { action: 'resume_checkout', bookingId: id }, 'tok-intruder');
      expect(r.status).toBe(404);
      expect(r.body.checkoutUrl).toBeUndefined();
      expect(r.body.checkoutState).toBeUndefined();
    }
    expect(stripeCalls).toEqual([]);
  });
});

describe('/api/cancel-booking: чужую бронь не отменить', () => {
  it('чужая ожидающая онлайн-бронь — 404, сессия Stripe не закрывается, бронь не меняется', async () => {
    const r = await call(cancelHandler, { bookingId: 'awaiting', reason: 'plans' }, 'tok-intruder');
    expect(r.status).toBe(404);
    expect(stripeCalls).toEqual([]);
    expect(booking('awaiting')).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_online' });
  });

  it('владелец не может отменить оплаченную онлайн-бронь — возврат только через театр', async () => {
    const r = await call(cancelHandler, { bookingId: 'paid', reason: 'plans' }, `tok-${OWNER}`);
    expect(r).toMatchObject({ status: 409, body: { reason: 'already_paid' } });
    expect(booking('paid').status).toBe('confirmed');
  });

  it('без токена — 401', async () => {
    expect((await call(cancelHandler, { bookingId: 'awaiting', reason: 'plans' }, null)).status).toBe(401);
  });
});
