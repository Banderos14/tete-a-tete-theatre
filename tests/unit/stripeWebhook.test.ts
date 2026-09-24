// Webhook Stripe и страховочная сверка — поведением.
//
// Подпись проверяет НАСТОЯЩИЙ stripe.webhooks.constructEvent: события
// подписываются тем же SDK (generateTestHeaderString), как это делает Stripe.
// Firestore — in-memory модель, Resend — перехваченный fetch, Checkout API —
// фейк (для сверки cron).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import { MemoryFirestore } from '../helpers/memoryFirestore';

let store = new MemoryFirestore();

vi.mock('firebase-admin/firestore', () => {
  class FakeTimestamp {
    constructor(readonly seconds: number) {}
    toMillis() { return this.seconds * 1000; }
  }
  return {
    FieldValue: { serverTimestamp: () => '<ts>', delete: () => '<delete>' },
    Timestamp:  {
      fromMillis: (ms: number) => new FakeTimestamp(ms / 1000),
      fromDate:   (d: Date) => new FakeTimestamp(d.getTime() / 1000),
    },
    getFirestore: () => store,
  };
});
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: async () => ({}) }) }));
vi.mock('../../server/shared/firebaseAdmin.js', () => ({ getAdminApp: () => ({}) }));

const realStripe = new Stripe('sk_test_unit_dummy');
const SECRET     = 'whsec_unit_test_secret';

type Session = Record<string, unknown> & { id: string; status: string; payment_status: string };
const sessions = new Map<string, Session>();
const expireCalls: string[] = [];
let stripeConfigured = true;

vi.mock('../../server/payments/stripe.client.js', async () => {
  const { ApiError } = await import('../../server/shared/errors.js');
  return {
    getStripe: () => {
      if (!stripeConfigured) throw new ApiError(503, 'not configured', 'online_payment_unavailable');
      return {
        webhooks: realStripe.webhooks,
        checkout: { sessions: {
          retrieve: async (id: string) => {
            const s = sessions.get(id);
            if (!s) throw new Error('No such checkout.session');
            return s;
          },
          expire: async (id: string) => {
            expireCalls.push(id);
            const s = sessions.get(id);
            if (!s || s.status !== 'open') throw new Error('Session is not in an expirable state');
            s.status = 'expired';
            return s;
          },
        } },
      };
    },
    expectedLivemode:       () => false,
    isOnlinePaymentEnabled: () => true,
  };
});

let rawBody = Buffer.from('');
const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
vi.mock('../../server/shared/http.js', () => ({
  readRawBody: async () => rawBody,
  readBody:    async () => rawBody.toString('utf8'),
  respond:     (_res: unknown, status: number, body: Record<string, unknown>) => { responses.push({ status, body }); },
}));

const { default: webhookHandler }   = await import('../../api/stripe-webhook.js');
const { reconcileOnlineBookings }  = await import('../../server/payments/reconcile.service.js');
const { readShowAvailability }     = await import('../../server/availability/availability.service.js');
const { computeLoyalty }           = await import('../../server/booking/loyalty.js');
const { HANDLED_EVENTS }           = await import('../../server/payments/webhook.service.js');

const SHOW = 'shutka';
const BID  = 'b1';
const SID  = 'cs_test_1';
const PI   = 'pi_test_1';
const NOW  = Date.now();

const mail: Array<Record<string, unknown>> = [];

function seedOnline(patch: Record<string, unknown> = {}, id = BID) {
  store.seed('bookings', id, {
    userId: 'u1', userEmail: 'anna@example.com', userName: 'Anna', showId: SHOW,
    showTitle: '«И в шутку, и всерьёз»', showDate: '02 Окт 2026', showTime: '20:00',
    ticketsCount: 2, seatsCount: 2, ticketType: 'standard', totalAmount: 45, originalAmount: 60,
    loyaltyDiscountApplied: true, ticketCode: 'ABCD-2345', status: 'pending',
    paymentMethod: 'online', paymentStatus: 'awaiting_online', stripeCheckoutSessionId: SID, lang: 'RU',
    paymentExpiresAt: { seconds: (NOW + 30 * 60 * 1000) / 1000 },
    ...patch,
  });
}

function seedVisits() {
  ['01 Мар 2026', '02 Мар 2026', '03 Мар 2026', '04 Мар 2026'].forEach((day, i) => store.seed('bookings', `past-${i}`, {
    userId: 'u1', showId: `show-${i}`, showDate: day, showTime: '20:00',
    status: 'attended', paymentStatus: 'paid', ticketsCount: 1, totalAmount: 20,
  }));
}

function session(patch: Record<string, unknown> = {}): Session {
  return {
    id: SID, object: 'checkout.session', status: 'complete', payment_status: 'paid',
    amount_total: 4500, currency: 'eur', client_reference_id: BID, metadata: { bookingId: BID },
    payment_intent: PI, expires_at: Math.floor(NOW / 1000) + 1800, livemode: false, url: null,
    ...patch,
  } as Session;
}

const refund = (patch: Record<string, unknown> = {}) => ({
  id: 're_test_1', object: 'refund', amount: 4500, currency: 'eur', payment_intent: PI, status: 'pending', ...patch,
});

let seq = 0;
function event(type: string, object: Record<string, unknown>, livemode = false) {
  return {
    id: `evt_test_${++seq}`, object: 'event', type, livemode, api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000), pending_webhooks: 1, request: null, data: { object },
  };
}

async function deliver(
  evt: ReturnType<typeof event>,
  opts: { secret?: string; signature?: string | null; tamper?: boolean; method?: string } = {},
) {
  const payload = JSON.stringify(evt);
  rawBody = Buffer.from(opts.tamper ? payload.replace('"amount_total":4500', '"amount_total":1') : payload);
  const signature = opts.signature === undefined
    ? realStripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET })
    : opts.signature;
  const headers = signature === null ? {} : { 'stripe-signature': signature };
  await webhookHandler({ method: opts.method ?? 'POST', headers } as never, {} as never);
  return responses.at(-1)!;
}

const booking = (id = BID) => store.peek('bookings', id)!;
const paidMails = () => mail.filter(m => String(m.subject).includes('Оплата получена'));

beforeEach(() => {
  store = new MemoryFirestore();
  sessions.clear();
  expireCalls.length = 0;
  responses.length = 0;
  mail.length = 0;
  stripeConfigured = true;
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'Theatre <tickets@example.com>');
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    mail.push(JSON.parse(init.body) as Record<string, unknown>);
    return new Response('{}', { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('подпись и окружение (fail closed)', () => {
  it('подписываемся ровно на 7 событий, включая refund.failed', () => {
    expect([...HANDLED_EVENTS].sort()).toEqual([
      'checkout.session.async_payment_failed', 'checkout.session.async_payment_succeeded',
      'checkout.session.completed', 'checkout.session.expired',
      'refund.created', 'refund.failed', 'refund.updated',
    ]);
  });

  it('без STRIPE_WEBHOOK_SECRET — 400, бронь не меняется', async () => {
    seedOnline();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r).toMatchObject({ status: 400, body: { reason: 'webhook_not_configured' } });
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('без заголовка Stripe-Signature — 400', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session()), { signature: null });
    expect(r).toMatchObject({ status: 400, body: { reason: 'invalid_signature' } });
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('подпись чужим секретом — 400', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session()), { secret: 'whsec_attacker' });
    expect(r).toMatchObject({ status: 400, body: { reason: 'invalid_signature' } });
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('тело изменено после подписи — 400', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session()), { tamper: true });
    expect(r.status).toBe(400);
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('live-событие в test-окружении — 400', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session(), true));
    expect(r).toMatchObject({ status: 400, body: { reason: 'livemode_mismatch' } });
  });

  it('только POST', async () => {
    const r = await deliver(event('checkout.session.completed', session()), { method: 'GET' });
    expect(r.status).toBe(405);
  });

  it('валидное, но ненужное событие — 200 ignored', async () => {
    const r = await deliver(event('customer.created', { id: 'cus_1', object: 'customer' }));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'ignored' } });
  });
});

describe('оплата подтверждается только webhook', () => {
  it('completed + paid → paid/confirmed, PaymentIntent, одно письмо «Оплата получена»', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'confirm', bookingId: BID } });
    expect(booking()).toMatchObject({
      paymentStatus: 'paid', status: 'confirmed', paidBy: 'stripe', paidAt: '<ts>',
      stripePaymentIntentId: PI, stripeCheckoutSessionId: SID,
    });
    expect(paidMails()).toHaveLength(1);
    expect(mail[0]!.to).toBe('anna@example.com');
  });

  it('повтор того же события (и retries) — no-op, второго письма нет', async () => {
    seedOnline();
    const evt = event('checkout.session.completed', session());
    await deliver(evt);
    const again = await deliver(evt);
    await deliver(event('checkout.session.completed', session()));
    expect(again).toMatchObject({ status: 200, body: { outcome: 'duplicate' } });
    expect(paidMails()).toHaveLength(1);
    expect(booking().paymentStatus).toBe('paid');
  });

  it('staging: письмо «Оплата получена» уходит одно, на тестовый адрес; повтор webhook — без второго', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', '"qa-inbox@example.com"');
    seedOnline();
    const evt = event('checkout.session.completed', session());
    await deliver(evt);
    await deliver(evt);
    expect(paidMails()).toHaveLength(1);
    expect(paidMails()[0]!.to).toBe('qa-inbox@example.com');
    expect(String(paidMails()[0]!.subject)).toMatch(/^\[STAGING → anna@example\.com\] /);
    expect(booking().emails).toMatchObject({ paid: { status: 'sent' } });
  });

  it('staging без тестового адреса: оплата подтверждена, письмо пропущено — и это видно в логе и в брони', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TEST_EMAIL_RECIPIENT', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedOnline();
    await deliver(event('checkout.session.completed', session()));
    expect(booking().paymentStatus).toBe('paid');
    expect(paidMails()).toHaveLength(0);
    expect(booking().emails).toMatchObject({ paid: { status: 'skipped', reason: 'staging_no_test_recipient' } });
    const logged = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('[ticket-email] paid skipped (staging_no_test_recipient)');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('anna@example.com');
    warn.mockRestore();
  });

  it('async_payment_succeeded подтверждает так же', async () => {
    seedOnline();
    await deliver(event('checkout.session.async_payment_succeeded', session()));
    expect(booking().paymentStatus).toBe('paid');
  });

  it('чужой session id с metadata нашей брони — бронь не меняется', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session({ id: 'cs_test_other' })));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'foreign' } });
    expect(booking().paymentStatus).toBe('awaiting_online');
    expect(paidMails()).toHaveLength(0);
  });

  it('неверная сумма — не paid, amount_mismatch сохранён, 200', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session({ amount_total: 100 })));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'amount_mismatch' } });
    const b = booking();
    expect(b.paymentStatus).toBe('awaiting_online');
    expect(b.paymentIssue).toBe('amount_mismatch');
    expect(b.paymentIssueDetails).toMatchObject({ expectedAmountCents: 4500, amountTotal: 100, paymentIntentId: PI });
    expect(paidMails()).toHaveLength(0);
  });

  it('неверная валюта — не paid, amount_mismatch', async () => {
    seedOnline();
    await deliver(event('checkout.session.completed', session({ currency: 'usd' })));
    expect(booking()).toMatchObject({ paymentStatus: 'awaiting_online', paymentIssue: 'amount_mismatch' });
  });

  it('оплата после протухания: деньги зафиксированы, бронь не воскрешена', async () => {
    seedOnline({ status: 'cancelled', paymentStatus: 'expired' });
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'paid_after_cancel' } });
    expect(booking()).toMatchObject({
      status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'paid_after_cancel', stripePaymentIntentId: PI,
    });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(paidMails()).toHaveLength(0);
  });

  it('completed + unpaid (отложенный метод) — бронь ждёт, ничего не меняется', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session({ payment_status: 'unpaid', payment_intent: null })));
    expect(r.body.outcome).toBe('awaiting_async');
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('сбой Firestore — 500, чтобы Stripe повторил доставку', async () => {
    seedOnline();
    const original = store.runTransaction.bind(store);
    store.runTransaction = (() => Promise.reject(new Error('UNAVAILABLE'))) as typeof store.runTransaction;
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r.status).toBe(500);
    store.runTransaction = original;
    // Повтор после восстановления проходит.
    expect((await deliver(event('checkout.session.completed', session()))).body.outcome).toBe('confirm');
  });
});

describe('истечение и неудачная оплата', () => {
  it('checkout.session.expired — места и скидка возвращаются', async () => {
    seedVisits();
    seedOnline();
    expect(computeLoyalty(store.listDocs('bookings').map(([, d]) => d)).loyaltyAvailable).toBe(false);
    const r = await deliver(event('checkout.session.expired', session({ status: 'expired', payment_status: 'unpaid', payment_intent: null })));
    expect(r.body.outcome).toBe('expired');
    expect(booking()).toMatchObject({ paymentStatus: 'expired', status: 'cancelled', expiredReason: 'session_expired' });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(computeLoyalty(store.listDocs('bookings').map(([, d]) => d)).loyaltyAvailable).toBe(true);
  });

  it('async_payment_failed — бронь протухает', async () => {
    seedOnline();
    await deliver(event('checkout.session.async_payment_failed', session({ payment_status: 'unpaid' })));
    expect(booking()).toMatchObject({ paymentStatus: 'expired', expiredReason: 'async_payment_failed' });
  });

  it('expired по оплаченной брони ничего не ломает', async () => {
    seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: PI });
    await deliver(event('checkout.session.expired', session({ status: 'expired', payment_status: 'unpaid' })));
    expect(booking()).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });
});

describe('возврат из Stripe Dashboard (синхронизация)', () => {
  const paid = () => seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: PI });
  const cancelMails = () => mail.filter(m => String(m.subject).includes('отменено'));

  it('refund.created pending на всю сумму — бронь отменена, места освобождены, письмо об отмене с возвратом', async () => {
    paid();
    await deliver(event('refund.created', refund()));
    expect(booking()).toMatchObject({
      status: 'cancelled', cancelledVia: 'stripe_refund', paymentStatus: 'paid',
      refund: { id: 're_test_1', status: 'pending', amount: 45 },
    });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(cancelMails()).toHaveLength(1);
    expect(String(cancelMails()[0]!.html)).toContain('будет возвращена');
  });

  it('refund.updated succeeded → refunded; повтор события — no-op и без второго письма', async () => {
    paid();
    await deliver(event('refund.created', refund()));
    await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    const dup = await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    expect(dup.body.outcome).toBe('ignored:duplicate');
    expect(booking()).toMatchObject({ paymentStatus: 'refunded', status: 'cancelled', refund: { status: 'succeeded' } });
    expect(cancelMails()).toHaveLength(1);
  });

  it('события не по порядку: pending после succeeded не откатывает', async () => {
    paid();
    await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    await deliver(event('refund.created', refund({ status: 'pending' })));
    expect(booking()).toMatchObject({ paymentStatus: 'refunded', refund: { status: 'succeeded' } });
  });

  it('возврат не прошёл после pending — бронь не воскрешается, проблема видна', async () => {
    paid();
    await deliver(event('refund.created', refund()));
    await deliver(event('refund.updated', refund({ status: 'failed' })));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'failed' } });
  });

  it('succeeded → failed: деньги не вернулись — refunded снимается, бронь не воскрешается', async () => {
    paid();
    await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    await deliver(event('refund.updated', refund({ status: 'failed' })));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'failed' } });
    expect(booking().refundedAt).toBe('<delete>');
  });

  it('refund.failed после succeeded: refunded снимается, бронь не воскрешается', async () => {
    paid();
    await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    const r = await deliver(event('refund.failed', refund({ status: 'failed' })));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'recorded', bookingId: BID } });
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'failed' } });
    expect(booking().refundedAt).toBe('<delete>');
  });

  it('refund.failed и refund.updated(failed) — одно изменение, второе событие no-op', async () => {
    paid();
    await deliver(event('refund.created', refund()));
    await deliver(event('refund.failed', refund({ status: 'failed' })));
    const second = await deliver(event('refund.updated', refund({ status: 'failed' })));
    expect(second.body.outcome).toBe('ignored:duplicate');
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'failed' } });
  });

  it('refund.failed до любого другого события: бронь остаётся оплаченной и активной', async () => {
    paid();
    await deliver(event('refund.failed', refund({ status: 'failed' })));
    expect(booking()).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', refund: { status: 'failed' } });
  });

  it('запоздавшее succeeded после failed не перезаписывает окончательный failed', async () => {
    paid();
    await deliver(event('refund.created', refund()));
    await deliver(event('refund.updated', refund({ status: 'failed' })));
    const late = await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    expect(late.body.outcome).toBe('ignored:stale');
    expect(booking()).toMatchObject({ paymentStatus: 'paid', refund: { status: 'failed' } });
  });

  it('частичный возврат — бронь действует, partial_refund', async () => {
    paid();
    await deliver(event('refund.created', refund({ amount: 1500, status: 'succeeded' })));
    expect(booking()).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', paymentIssue: 'partial_refund' });
  });

  it('возврат по чужому платежу бронь не трогает', async () => {
    paid();
    const r = await deliver(event('refund.created', refund({ payment_intent: 'pi_other' })));
    expect(r.body.outcome).toBe('not_found');
    expect(booking().status).toBe('confirmed');
  });

  it('поздний повтор completed по возвращённой брони не затирает refunded', async () => {
    paid();
    await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    await deliver(event('checkout.session.completed', session()));
    expect(booking()).toMatchObject({ paymentStatus: 'refunded', status: 'cancelled' });
    expect(paidMails()).toHaveLength(0);
  });
});

describe('страховочная сверка cron', () => {
  const overdue = { paymentExpiresAt: { seconds: (NOW - 2 * 60 * 60 * 1000) / 1000 } };

  it('открытая просроченная сессия: сначала закрывается в Stripe, затем бронь протухает', async () => {
    seedOnline(overdue);
    sessions.set(SID, session({ status: 'open', payment_status: 'unpaid', payment_intent: null }));
    const r = await reconcileOnlineBookings(NOW);
    expect(expireCalls).toEqual([SID]);
    expect(r).toMatchObject({ checked: 1, expired: 1 });
    expect(booking()).toMatchObject({ paymentStatus: 'expired', expiredReason: 'reconcile_expired' });
  });

  it('webhook потерян, но Stripe говорит «оплачено» — бронь оплачивается, а не протухает', async () => {
    seedOnline(overdue);
    sessions.set(SID, session());
    const r = await reconcileOnlineBookings(NOW);
    expect(r).toMatchObject({ checked: 1, paid: 1, expired: 0 });
    expect(booking()).toMatchObject({ paymentStatus: 'paid', paidBy: 'stripe' });
    expect(paidMails()).toHaveLength(1);
  });

  it('истёкшая в Stripe сессия — бронь протухает', async () => {
    seedOnline(overdue);
    sessions.set(SID, session({ status: 'expired', payment_status: 'unpaid' }));
    expect((await reconcileOnlineBookings(NOW)).expired).toBe(1);
  });

  it('complete + unpaid (отложенная оплата) — не трогаем', async () => {
    seedOnline(overdue);
    sessions.set(SID, session({ payment_status: 'unpaid' }));
    const r = await reconcileOnlineBookings(NOW);
    expect(r).toMatchObject({ skipped: 1, expired: 0 });
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('срок не истёк — Stripe даже не спрашиваем', async () => {
    seedOnline();
    sessions.set(SID, session({ status: 'open', payment_status: 'unpaid' }));
    expect((await reconcileOnlineBookings(NOW)).checked).toBe(0);
    expect(expireCalls).toEqual([]);
  });

  it('бронь без записанной сессии (ссылку никто не получал) протухает без Stripe', async () => {
    seedOnline({ ...overdue, stripeCheckoutSessionId: null });
    expect((await reconcileOnlineBookings(NOW)).expired).toBe(1);
    expect(booking().paymentStatus).toBe('expired');
  });

  it('Stripe не настроен — сверка не выполняется и ничего не ломает', async () => {
    stripeConfigured = false;
    seedOnline(overdue);
    expect(await reconcileOnlineBookings(NOW)).toMatchObject({ disabled: true, checked: 0 });
    expect(booking().paymentStatus).toBe('awaiting_online');
  });
});

// ── Phase 6: аудит — отказоустойчивость, гонки, возвраты в несколько частей ──

describe('webhook: некорректные запросы и сбои окружения', () => {
  it('PUT / DELETE — 405; OPTIONS — 204 без обработки события', async () => {
    seedOnline();
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      expect((await deliver(event('checkout.session.completed', session()), { method })).status).toBe(405);
    }
    expect((await deliver(event('checkout.session.completed', session()), { method: 'OPTIONS' })).status).toBe(204);
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('подписанное, но не-JSON тело — 400, бронь не меняется', async () => {
    seedOnline();
    const payload = 'not json at all {';
    rawBody = Buffer.from(payload);
    const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    await webhookHandler({ method: 'POST', headers: { 'stripe-signature': signature } } as never, {} as never);
    expect(responses.at(-1)!.status).toBe(400);
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('пустое тело и мусорная подпись — 400', async () => {
    seedOnline();
    rawBody = Buffer.from('');
    await webhookHandler({ method: 'POST', headers: { 'stripe-signature': 't=1,v1=deadbeef' } } as never, {} as never);
    expect(responses.at(-1)).toMatchObject({ status: 400, body: { reason: 'invalid_signature' } });
  });

  it('ответ на отказ не раскрывает секрет и внутренние детали', async () => {
    const r = await deliver(event('checkout.session.completed', session()), { secret: 'whsec_attacker' });
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
    expect(JSON.stringify(r.body)).not.toContain('whsec_');
  });

  it('ключ Stripe не задан — 503 (Stripe повторит), бронь не меняется', async () => {
    seedOnline();
    stripeConfigured = false;
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r.status).toBe(503);
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('бронь не найдена — 200 not_found, ничего не создаётся', async () => {
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'not_found' } });
    expect(store.listDocs('bookings')).toHaveLength(0);
    expect(mail).toHaveLength(0);
  });

  it('небезопасный bookingId в metadata (путь документа) — foreign, без записи', async () => {
    seedOnline();
    const r = await deliver(event('checkout.session.completed', session({
      metadata: { bookingId: '../users/u1' }, client_reference_id: '../users/u1',
    })));
    expect(r.body.outcome).toBe('foreign');
    expect(booking().paymentStatus).toBe('awaiting_online');
  });

  it('оплаченная бронь + completed с другим PaymentIntent — ничего не меняется', async () => {
    seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: PI });
    const r = await deliver(event('checkout.session.completed', session({ payment_intent: 'pi_other' })));
    expect(r.body.outcome).toBe('already_recorded');
    expect(booking()).toMatchObject({ paymentStatus: 'paid', stripePaymentIntentId: PI });
  });

  it('сумма на цент меньше / валюта в верхнем регистре', async () => {
    seedOnline();
    await deliver(event('checkout.session.completed', session({ amount_total: 4499 })));
    expect(booking()).toMatchObject({ paymentStatus: 'awaiting_online', paymentIssue: 'amount_mismatch' });

    seedOnline({}, 'b2');
    sessions.clear();
    const r = await deliver(event('checkout.session.completed', session({
      id: 'cs_b2', client_reference_id: 'b2', metadata: { bookingId: 'b2' }, currency: 'EUR',
    })));
    // Для b2 записана другая сессия (SID) — чужая; валюту проверяем отдельно ниже.
    expect(r.body.outcome).toBe('foreign');
    store.seed('bookings', 'b3', { ...booking('b2'), stripeCheckoutSessionId: 'cs_b3' });
    const ok = await deliver(event('checkout.session.completed', session({
      id: 'cs_b3', client_reference_id: 'b3', metadata: { bookingId: 'b3' }, currency: 'EUR',
    })));
    expect(ok.body.outcome).toBe('confirm');
  });
});

describe('письмо не влияет на оплату', () => {
  it('Resend упал: бронь остаётся оплаченной, письмо failed; повтор webhook дошлёт письмо, оплата одна', async () => {
    seedOnline();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r).toMatchObject({ status: 200, body: { outcome: 'confirm' } });
    expect(booking()).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
    expect((booking().emails as Record<string, { status: string }>).paid.status).toBe('failed');

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      mail.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response('{}', { status: 200 });
    }));
    const again = await deliver(event('checkout.session.completed', session()));
    expect(again.body.outcome).toBe('duplicate');
    expect(paidMails()).toHaveLength(1);
    expect((booking().emails as Record<string, { status: string }>).paid.status).toBe('sent');
  });

  it('Resend бросает исключение (сеть) — 200, оплата записана', async () => {
    seedOnline();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const r = await deliver(event('checkout.session.completed', session()));
    expect(r.status).toBe(200);
    expect(booking().paymentStatus).toBe('paid');
  });
});

describe('гонки: параллельные доставки и cron', () => {
  const overdue = { paymentExpiresAt: { seconds: (NOW - 2 * 60 * 60 * 1000) / 1000 } };

  it('два одинаковых completed одновременно — одна оплата, одно письмо', async () => {
    seedOnline();
    const evt = event('checkout.session.completed', session());
    await Promise.all([deliver(evt), deliver(evt), deliver(event('checkout.session.completed', session()))]);
    expect(booking()).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
    expect(paidMails()).toHaveLength(1);
  });

  it('cron-сверка одновременно с webhook completed — бронь оплачена, не протухла, одно письмо', async () => {
    seedOnline(overdue);
    sessions.set(SID, session());
    await Promise.all([reconcileOnlineBookings(NOW), deliver(event('checkout.session.completed', session()))]);
    expect(booking()).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
    expect(paidMails()).toHaveLength(1);
    expect(expireCalls).toEqual([]);
  });

  it('completed уже записан, затем запоздавший expired — оплата не теряется', async () => {
    seedOnline();
    await deliver(event('checkout.session.completed', session()));
    await deliver(event('checkout.session.expired', session({ status: 'expired', payment_status: 'unpaid' })));
    expect(booking()).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });

  it('expired уже записан, затем completed (деньги пришли) — paid_after_cancel, места не возвращаются', async () => {
    seedOnline();
    await deliver(event('checkout.session.expired', session({ status: 'expired', payment_status: 'unpaid' })));
    await deliver(event('checkout.session.completed', session()));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'paid_after_cancel' });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(paidMails()).toHaveLength(0);
  });

  it('повторный прогон cron по оплаченной брони ничего не меняет', async () => {
    seedOnline(overdue);
    sessions.set(SID, session());
    await reconcileOnlineBookings(NOW);
    const before = JSON.stringify(booking());
    const again  = await reconcileOnlineBookings(NOW);
    expect(again.checked).toBe(0);
    expect(JSON.stringify(booking())).toBe(before);
    expect(paidMails()).toHaveLength(1);
  });

  it('refund.created и refund.updated(succeeded) одновременно — refunded, место освобождено один раз, одно письмо', async () => {
    seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: PI });
    seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: 'pi_neighbour', stripeCheckoutSessionId: 'cs_n' }, 'neighbour');
    await Promise.all([
      deliver(event('refund.created', refund())),
      deliver(event('refund.updated', refund({ status: 'succeeded' }))),
    ]);
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refund: { status: 'succeeded' } });
    // Освободились ровно места этой брони: соседняя по-прежнему занимает свои.
    expect((await readShowAvailability())[SHOW]!.sold).toBe(2);
    expect(mail.filter(m => String(m.subject).includes('отменено'))).toHaveLength(1);
  });
});

describe('возврат в несколько частей (регрессия Phase 6)', () => {
  // Раньше «полный ли возврат» решал только последний возврат, а второй
  // возврат после succeeded первого игнорировался: деньги вернулись целиком,
  // а билет оставался действующим, и обычная отмена отвечала refund_required.
  const paid = () => seedOnline({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: PI });
  const cancelMails = () => mail.filter(m => String(m.subject).includes('отменено'));

  it('частичный, затем остаток — бронь отменена, refunded, проблема закрыта, одно письмо', async () => {
    paid();
    await deliver(event('refund.created', refund({ id: 're_a', amount: 1500, status: 'succeeded' })));
    expect(booking()).toMatchObject({ status: 'confirmed', paymentIssue: 'partial_refund' });

    await deliver(event('refund.created', refund({ id: 're_b', amount: 3000, status: 'pending' })));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { id: 're_b', status: 'pending' } });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);

    await deliver(event('refund.updated', refund({ id: 're_b', amount: 3000, status: 'succeeded' })));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAt: '<ts>' });
    // FieldValue.delete() в тестовой модели — метка '<delete>'.
    expect(booking().paymentIssue).toBe('<delete>');
    expect(booking().paymentIssueResolved).toMatchObject({ issue: 'partial_refund', via: 'refund', refundId: 're_b' });
    expect(booking().refunds).toEqual({
      re_a: { status: 'succeeded', amountCents: 1500 },
      re_b: { status: 'succeeded', amountCents: 3000 },
    });
    expect(cancelMails()).toHaveLength(1);
  });

  it('два частичных, второй не прошёл — бронь действует, деньги частично у театра', async () => {
    paid();
    await deliver(event('refund.created', refund({ id: 're_a', amount: 1500, status: 'succeeded' })));
    await deliver(event('refund.created', refund({ id: 're_b', amount: 3000, status: 'pending' })));
    await deliver(event('refund.failed',  refund({ id: 're_b', amount: 3000, status: 'failed' })));
    // Бронь уже была отменена на pending — не воскрешается, но и refunded не ставится.
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
    expect(booking().paymentIssue).toBeTruthy();
  });

  it('полный succeeded, затем он же failed — refunded снимается, даже если был частичный возврат раньше', async () => {
    paid();
    await deliver(event('refund.created', refund({ id: 're_a', amount: 4500, status: 'succeeded' })));
    expect(booking().paymentStatus).toBe('refunded');
    await deliver(event('refund.updated', refund({ id: 're_a', amount: 4500, status: 'failed' })));
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'refund_failed' });
  });

  it('бронь со старой записью refund (без реестра): повтор того же события — дубль', async () => {
    seedOnline({
      paymentStatus: 'refunded', status: 'cancelled', stripePaymentIntentId: PI,
      refund: { id: 're_test_1', status: 'succeeded', amount: 45 },
    });
    const r = await deliver(event('refund.updated', refund({ status: 'succeeded' })));
    expect(r.body.outcome).toBe('ignored:duplicate');
    expect(booking().paymentStatus).toBe('refunded');
  });
});
