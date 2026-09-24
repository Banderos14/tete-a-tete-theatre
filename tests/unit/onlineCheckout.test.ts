// Онлайн-оплата: создание брони и Stripe Hosted Checkout — поведением.
//
// Настоящие сервисы и handler работают поверх in-memory Firestore; Stripe
// подменён фейком с той же семантикой, что важна нам: idempotency key
// возвращает ту же сессию, expire закрывает только открытую сессию.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';

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
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ getUser: async () => ({ displayName: 'Anna', email: 'anna@example.com' }) }),
}));
vi.mock('../../server/shared/firebaseAdmin.js', () => ({ getAdminApp: () => ({}) }));

// ── Фейковый Stripe ─────────────────────────────────────────────────────────

type FakeSession = {
  id: string; object: 'checkout.session'; url: string | null; status: string; payment_status: string;
  amount_total: number; currency: string; client_reference_id: string | null;
  metadata: Record<string, string>; payment_intent: string | null; expires_at: number; livemode: boolean;
};

class FakeStripe {
  sessions = new Map<string, FakeSession>();
  created: Array<Record<string, unknown>> = [];
  byKey = new Map<string, string>();
  failCreate = false;
  failExpire = false;
  private n = 0;

  checkout = { sessions: {
    create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
      const key = opts?.idempotencyKey;
      if (key && this.byKey.has(key)) return this.sessions.get(this.byKey.get(key)!)!;
      if (this.failCreate) throw Object.assign(new Error('network down'), { type: 'StripeConnectionError' });
      const id    = `cs_test_${++this.n}`;
      const items = params.line_items as Array<{ price_data: { unit_amount: number; currency: string } }>;
      const s: FakeSession = {
        id, object: 'checkout.session', url: `https://checkout.stripe.test/${id}`,
        status: 'open', payment_status: 'unpaid',
        amount_total: items[0]!.price_data.unit_amount, currency: items[0]!.price_data.currency,
        client_reference_id: params.client_reference_id as string,
        metadata: params.metadata as Record<string, string>,
        payment_intent: null, expires_at: params.expires_at as number, livemode: false,
      };
      this.sessions.set(id, s);
      if (key) this.byKey.set(key, id);
      this.created.push(params);
      return s;
    },
    retrieve: async (id: string) => {
      const s = this.sessions.get(id);
      if (!s) throw new Error('No such checkout.session');
      return s;
    },
    expire: async (id: string) => {
      const s = this.sessions.get(id);
      if (!s || s.status !== 'open' || this.failExpire) throw new Error('Session is not in an expirable state');
      s.status = 'expired';
      return s;
    },
  } };

  pay(id: string, pi = 'pi_test_1') {
    const s = this.sessions.get(id)!;
    Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: pi, url: null });
  }
}

let stripe = new FakeStripe();
let onlineEnabled = true;
vi.mock('../../server/payments/stripe.client.js', () => ({
  getStripe:              () => stripe,
  isOnlinePaymentEnabled: () => onlineEnabled,
  expectedLivemode:       () => false,
}));

// HTTP-обвязка handler'а
let requestBody = '';
let requestHeaders: Record<string, string> = {};
const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
let callerUid = 'user-anna';
vi.mock('../../server/shared/http.js', () => ({
  readBody: async () => requestBody,
  respond:  (_res: unknown, status: number, body: Record<string, unknown>) => { responses.push({ status, body }); },
}));
vi.mock('../../server/shared/auth.js', () => ({
  requireCaller: async () => ({ uid: callerUid, idToken: 't' }),
  requireAdmin:  async () => ({ uid: 'admin-1', idToken: 't' }),
}));

const { createBooking }         = await import('../../server/booking/booking.service.js');
const { validateCreateBooking } = await import('../../server/booking/booking.validation.js');
const { cancelBookingByUser }   = await import('../../server/booking/cancellation.service.js');
const { cancelBookingByAdmin, markUnpaidByAdmin } = await import('../../server/booking/admin.service.js');
const { checkinTicket }         = await import('../../server/checkin/checkin.service.js');
const { readShowAvailability }  = await import('../../server/availability/availability.service.js');
const { default: createHandler } = await import('../../api/create-booking.js');
const { ApiError }              = await import('../../server/shared/errors.js');
const { isScannableTicket, occupiesCapacity, isPaymentOverdue, isTransferOverdue } =
  await import('../../shared/domain/bookingRules.js');
const { isCashDue, isBlocked }  = await import('../../server/checkin/group.js');
const { buildCheckoutSessionParams } = await import('../../server/payments/checkout.service.js');

const UID  = 'user-anna';
const SHOW = 'shutka'; // 02 Окт 2026, 20:00, обычный билет 30 €
const NOW  = new Date('2026-09-20T10:00:00Z');
const MIN  = 60 * 1000;

const request = (body: Record<string, unknown> = {}, uid = UID, key: string | null = null) => ({
  ...validateCreateBooking({
    showId: SHOW, ticketType: 'standard', ticketsCount: 2, paymentMethod: 'online',
    comment: '', phone: '+33 6 12 34 56 78', lang: 'RU', ...body,
  }),
  uid,
  idempotencyKeyRaw: key,
});

function seedVisits(uid = UID) {
  const days = ['01 Мар 2026', '02 Мар 2026', '03 Мар 2026', '04 Мар 2026'];
  days.forEach((day, i) => store.seed('bookings', `past-${i}`, {
    userId: uid, showId: `show-${i}`, showDate: day, showTime: '20:00',
    status: 'attended', paymentStatus: 'paid', ticketsCount: 1, totalAmount: 20,
  }));
}

async function refusal(p: Promise<unknown>): Promise<InstanceType<typeof ApiError>> {
  try { await p; } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('ожидался отказ');
}

const booking = (id: string) => store.peek('bookings', id)!;
// In-memory Firestore клонирует документ: Timestamp приходит как { seconds }, как и на сервере.
const msOf = (ts: unknown) => (ts as { seconds: number }).seconds * 1000;

beforeEach(() => {
  store  = new MemoryFirestore();
  stripe = new FakeStripe();
  onlineEnabled = true;
  callerUid = UID;
  responses.length = 0;
  requestHeaders = {};
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('PUBLIC_SITE_URL', 'https://staging.example.test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('онлайн-бронь: цена только с сервера', () => {
  it('Stripe получает ровно totalAmount брони одной строкой, EUR', async () => {
    const res = await createBooking(request());
    expect(res.totalAmount).toBe(60);
    expect(stripe.created).toHaveLength(1);
    const p = stripe.created[0]! as Record<string, unknown> & {
      line_items: Array<{ quantity: number; price_data: { currency: string; unit_amount: number } }>;
    };
    expect(p.mode).toBe('payment');
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items[0]).toMatchObject({ quantity: 1, price_data: { currency: 'eur', unit_amount: 6000 } });
    expect(p.client_reference_id).toBe(res.bookingId);
    expect(p.metadata).toEqual({ bookingId: res.bookingId });
    expect(p.payment_intent_data).toEqual({ metadata: { bookingId: res.bookingId } });
    expect(p.customer_email).toBe('anna@example.com');
    expect(p.success_url).toBe(`https://staging.example.test/?checkout=success&booking=${res.bookingId}`);
    expect(p.cancel_url).toBe(`https://staging.example.test/?checkout=cancelled&booking=${res.bookingId}`);
  });

  it('скидка лояльности уже внутри суммы: 2 × 30 € → 45 € (4500 центов)', async () => {
    seedVisits();
    const res = await createBooking(request());
    expect(res).toMatchObject({ totalAmount: 45, loyaltyDiscountApplied: true, loyaltyDiscountAmount: 15 });
    const items = stripe.created[0]!.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(items[0]!.price_data.unit_amount).toBe(4500);
  });

  it('клиентские amount / discount / paid игнорируются', async () => {
    const res = await createBooking(request({ totalAmount: 1, amount: 1, discount: 50, paymentStatus: 'paid', paid: true }));
    expect(res.totalAmount).toBe(60);
    const items = stripe.created[0]!.line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(items[0]!.price_data.unit_amount).toBe(6000);
    expect(booking(res.bookingId)).toMatchObject({ paymentStatus: 'awaiting_online', status: 'pending' });
  });

  it('параметры сессии: сумма не зависит ни от чего, кроме totalAmount', () => {
    const p = buildCheckoutSessionParams({
      bookingId: 'b1', totalAmount: 37.5, showTitle: 'T', showDate: 'D', showTime: '20:00', priceInfo: '',
      userEmail: 'bad', lang: 'FR', expiresAtMs: NOW.getTime() + 31 * MIN, siteBase: 'https://x.test/',
    });
    expect(p.line_items![0]!.price_data!.unit_amount).toBe(3750);
    expect(p.customer_email).toBeUndefined();
    expect(p.locale).toBe('fr');
    expect(p.success_url).toBe('https://x.test/?checkout=success&booking=b1');
  });
});

describe('онлайн-бронь: состояние и срок', () => {
  it('pending / awaiting_online, места заняты, билета и QR нет', async () => {
    const res = await createBooking(request());
    const b = booking(res.bookingId);
    expect(b).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_online', paymentMethod: 'online' });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(2);
    expect(isScannableTicket({ status: 'pending', paymentStatus: 'awaiting_online' })).toBe(false);
  });

  it('срок холда после создания — фактический session.expires_at', async () => {
    const res = await createBooking(request());
    const b = booking(res.bookingId);
    const session = stripe.sessions.get(String(b.stripeCheckoutSessionId))!;
    expect(msOf(b.paymentExpiresAt)).toBe(session.expires_at * 1000);
    expect(res.paymentExpiresAt).toBe(session.expires_at * 1000);
    // Не меньше минимума Stripe (30 мин) и близко к нему.
    expect(session.expires_at * 1000 - NOW.getTime()).toBeGreaterThanOrEqual(30 * MIN);
    expect(session.expires_at * 1000 - NOW.getTime()).toBeLessThanOrEqual(32 * MIN);
    expect(res.checkoutUrl).toBe(session.url);
  });

  it('приём онлайн-оплаты выключен на сервере — 503, брони нет', async () => {
    onlineEnabled = false;
    const err = await refusal(createBooking(request()));
    expect(err.status).toBe(503);
    expect(err.reason).toBe('online_payment_unavailable');
    expect(store.listDocs('bookings')).toHaveLength(0);
  });
});

describe('идемпотентность Checkout', () => {
  it('повтор с тем же Idempotency-Key: одна бронь, одна сессия, та же ссылка', async () => {
    const a = await createBooking(request({}, UID, 'key-1'));
    const b = await createBooking(request({}, UID, 'key-1'));
    expect(b.replayed).toBe(true);
    expect(b.bookingId).toBe(a.bookingId);
    expect(b.checkoutUrl).toBe(a.checkoutUrl);
    expect(stripe.created).toHaveLength(1);
    expect(store.listDocs('bookings')).toHaveLength(1);
  });

  it('повтор после оплаты сообщает «оплачено», новой сессии нет', async () => {
    const a = await createBooking(request({}, UID, 'key-2'));
    stripe.pay(String(booking(a.bookingId).stripeCheckoutSessionId));
    const b = await createBooking(request({}, UID, 'key-2'));
    expect(b.checkoutState).toBe('paid');
    expect(b.checkoutUrl).toBeUndefined();
    expect(booking(a.bookingId).paymentStatus).toBe('paid');
    expect(stripe.created).toHaveLength(1);
  });
});

describe('сбой создания сессии', () => {
  it('бронь не остаётся занятой: протухает, места и скидка возвращаются, 502', async () => {
    seedVisits();
    stripe.failCreate = true;
    const err = await refusal(createBooking(request()));
    expect(err.status).toBe(502);
    expect(err.reason).toBe('payment_unavailable');

    const [id, b] = store.listDocs('bookings').find(([, d]) => d.paymentMethod === 'online')!;
    expect(b).toMatchObject({ paymentStatus: 'expired', status: 'cancelled', expiredReason: 'checkout_failed' });
    expect(occupiesCapacity(booking(id) as { status: string; paymentStatus: string })).toBe(false);
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);

    // Скидка снова доступна следующей брони.
    stripe.failCreate = false;
    const next = await createBooking(request());
    expect(next.loyaltyDiscountApplied).toBe(true);
  });
});

describe('вернуться к оплате (resume_checkout)', () => {
  it('своя бронь — ссылка той же сессии; чужая — 404', async () => {
    const a = await createBooking(request());
    callerUid = UID;
    requestBody = JSON.stringify({ action: 'resume_checkout', bookingId: a.bookingId });
    await createHandler({ method: 'POST', headers: requestHeaders } as never, {} as never);
    expect(responses.at(-1)).toMatchObject({ status: 200, body: { checkoutState: 'open', checkoutUrl: a.checkoutUrl } });

    callerUid = 'someone-else';
    await createHandler({ method: 'POST', headers: requestHeaders } as never, {} as never);
    expect(responses.at(-1)!.status).toBe(404);
    expect(stripe.created).toHaveLength(1);
  });

  it('истёкшая сессия: бронь протухает, клиенту checkout_expired', async () => {
    const a = await createBooking(request());
    stripe.sessions.get(String(booking(a.bookingId).stripeCheckoutSessionId))!.status = 'expired';
    requestBody = JSON.stringify({ action: 'resume_checkout', bookingId: a.bookingId });
    await createHandler({ method: 'POST', headers: requestHeaders } as never, {} as never);
    expect(responses.at(-1)).toMatchObject({ status: 409, body: { reason: 'checkout_expired' } });
    expect(booking(a.bookingId)).toMatchObject({ paymentStatus: 'expired', status: 'cancelled' });
  });
});

describe('handler: письмо до оплаты не отправляется', () => {
  it('онлайн-бронь — без письма-билета, в ответе ссылка на оплату', async () => {
    requestBody = JSON.stringify({
      showId: SHOW, ticketType: 'standard', ticketsCount: 1, paymentMethod: 'online',
      comment: '', phone: '+33 6 12 34 56 78', lang: 'RU',
    });
    await createHandler({ method: 'POST', headers: requestHeaders } as never, {} as never);
    const out = responses.at(-1)!;
    expect(out.status).toBe(200);
    expect(out.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(out.body.ticketEmail).toBeUndefined();
    expect(booking(String(out.body.bookingId)).emails).toBeUndefined();
  });
});

describe('отмена онлайн-брони', () => {
  it('зритель отменяет ожидающую оплаты: сессия закрыта, бронь отменена', async () => {
    const a = await createBooking(request());
    const sid = String(booking(a.bookingId).stripeCheckoutSessionId);
    await cancelBookingByUser({ uid: UID, bookingId: a.bookingId, reason: 'plans', comment: '' });
    expect(stripe.sessions.get(sid)!.status).toBe('expired');
    expect(booking(a.bookingId).status).toBe('cancelled');
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
  });

  it('Stripe уже принял оплату — отмены нет, бронь становится оплаченной', async () => {
    const a = await createBooking(request());
    const sid = String(booking(a.bookingId).stripeCheckoutSessionId);
    stripe.pay(sid);
    const err = await refusal(cancelBookingByUser({ uid: UID, bookingId: a.bookingId, reason: 'plans', comment: '' }));
    expect(err.reason).toBe('already_paid');
    expect(booking(a.bookingId)).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', paidBy: 'stripe' });
  });

  it('чужой пользователь не может закрыть сессию чужой брони', async () => {
    const a = await createBooking(request());
    const sid = String(booking(a.bookingId).stripeCheckoutSessionId);
    await refusal(cancelBookingByUser({ uid: 'intruder', bookingId: a.bookingId, reason: 'plans', comment: '' }));
    expect(stripe.sessions.get(sid)!.status).toBe('open');
  });

  it('администратор: ожидающую оплаты — можно (сессия закрыта); оплаченную — только через возврат', async () => {
    const a = await createBooking(request());
    await cancelBookingByAdmin('admin-1', a.bookingId);
    expect(booking(a.bookingId).status).toBe('cancelled');

    const b = await createBooking(request());
    stripe.pay(String(booking(b.bookingId).stripeCheckoutSessionId));
    const { confirmOnlinePayment } = await import('../../server/payments/onlinePayment.service.js');
    const { sessionViewOf } = await import('../../server/payments/onlinePayment.js');
    await confirmOnlinePayment(sessionViewOf(stripe.sessions.get(String(booking(b.bookingId).stripeCheckoutSessionId)) as never));
    const err = await refusal(cancelBookingByAdmin('admin-1', b.bookingId));
    expect(err.reason).toBe('refund_required');
    expect(booking(b.bookingId).status).toBe('confirmed');

    const unpaid = await refusal(markUnpaidByAdmin(b.bookingId));
    expect(unpaid.reason).toBe('online_payment');
  });
});

describe('онлайн-бронь на входе', () => {
  it('ожидающую онлайн-оплаты нельзя «принять оплату» на входе', async () => {
    const a = await createBooking(request());
    const code = String(booking(a.bookingId).ticketCode);
    const err = await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: code, action: 'mark_paid' }));
    expect(err.reason).toBe('online_payment');
    expect(booking(a.bookingId).paymentStatus).toBe('awaiting_online');
  });

  it('awaiting_online — не наличные к получению и блокирует групповой проход', () => {
    const snap = { paymentStatus: 'awaiting_online', status: 'pending' } as Parameters<typeof isCashDue>[0];
    expect(isCashDue(snap)).toBe(false);
    expect(isBlocked(snap)).toBe(true);
  });
});

describe('доменные правила онлайн-оплаты', () => {
  it('awaiting_online занимает место, expired и refunded/cancelled — нет', () => {
    expect(occupiesCapacity({ status: 'pending', paymentStatus: 'awaiting_online' })).toBe(true);
    expect(occupiesCapacity({ status: 'cancelled', paymentStatus: 'expired' })).toBe(false);
    expect(occupiesCapacity({ status: 'cancelled', paymentStatus: 'refunded' })).toBe(false);
  });

  it('refunded / cancelled — не билет', () => {
    expect(isScannableTicket({ status: 'cancelled', paymentStatus: 'refunded' })).toBe(false);
    expect(isScannableTicket({ status: 'cancelled', paymentStatus: 'paid' })).toBe(false);
  });

  it('isPaymentOverdue: онлайн и перевод; клиентское протухание — только перевод', () => {
    const now = NOW.getTime();
    const online = { status: 'pending', paymentStatus: 'awaiting_online', paymentExpiresAtMs: now - 1 };
    expect(isPaymentOverdue(online, now)).toBe(true);
    expect(isPaymentOverdue({ ...online, paymentExpiresAtMs: now + 1 }, now)).toBe(false);
    expect(isTransferOverdue(online, now)).toBe(false);
    expect(isPaymentOverdue({ status: 'pending', paymentStatus: 'not_paid', paymentExpiresAtMs: now - 1 }, now)).toBe(false);
  });

  it('старые брони без новых полей не ломаются', () => {
    const start = parseShowStartUtcMs('02 Окт 2026', '20:00');
    expect(start).not.toBeNull();
    expect(isPaymentOverdue({ status: 'confirmed', paymentStatus: 'paid' }, NOW.getTime())).toBe(false);
  });
});

// ── Phase 6: аудит — гонки, сбои Stripe, прежние способы оплаты ─────────────

describe('вместимость и гонки при онлайн-оплате', () => {
  const fillHall = (seats: number) => store.seed('bookings', 'hall', {
    userId: 'other', showId: SHOW, showDate: '02 Окт 2026', showTime: '20:00',
    status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'on_site', ticketsCount: seats, seatsCount: seats,
  });

  it('два зрителя одновременно за последними местами — продано не больше вместимости', async () => {
    const { THEATRE_CAPACITY } = await import('../../shared/catalog/shows.js');
    fillHall(THEATRE_CAPACITY - 2);
    const results = await Promise.allSettled([
      createBooking(request({}, 'user-a', 'ka')),
      createBooking(request({}, 'user-b', 'kb')),
    ]);
    const ok      = results.filter(r => r.status === 'fulfilled');
    const refused = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0]!.reason as { reason?: string }).reason).toBe('capacity_exceeded');
    expect((await readShowAvailability())[SHOW]!.sold).toBe(THEATRE_CAPACITY);
    expect(stripe.created).toHaveLength(1);
  });

  it('ожидающая онлайн-оплаты бронь держит места против оплаты на месте', async () => {
    const { THEATRE_CAPACITY } = await import('../../shared/catalog/shows.js');
    fillHall(THEATRE_CAPACITY - 2);
    await createBooking(request({}, 'user-a'));
    const err = await refusal(createBooking(request({ paymentMethod: 'on_site' }, 'user-b')));
    expect(err.reason).toBe('capacity_exceeded');
  });

  it('двойной клик: два одновременных запроса с одним ключом — одна бронь, одна сессия, одна ссылка', async () => {
    const [a, b] = await Promise.all([
      createBooking(request({}, UID, 'dbl')),
      createBooking(request({}, UID, 'dbl')),
    ]);
    expect(a.bookingId).toBe(b.bookingId);
    expect(a.checkoutUrl).toBe(b.checkoutUrl);
    expect(store.listDocs('bookings')).toHaveLength(1);
    expect(stripe.created).toHaveLength(1);
  });

  it('две вкладки с разными ключами и одной наградой лояльности — скидку получает только одна бронь', async () => {
    seedVisits();
    const [a, b] = await Promise.all([
      createBooking(request({}, UID, 'tab-1')),
      createBooking(request({}, UID, 'tab-2')),
    ]);
    expect([a.loyaltyDiscountApplied, b.loyaltyDiscountApplied].filter(Boolean)).toHaveLength(1);
    const amounts = (stripe.created.map(p => (p.line_items as Array<{ price_data: { unit_amount: number } }>)[0]!.price_data.unit_amount)).sort();
    expect(amounts).toEqual([4500, 6000]);
  });

  it('отмена ожидающей онлайн-брони возвращает награду лояльности', async () => {
    seedVisits();
    const a = await createBooking(request());
    expect(a.loyaltyDiscountApplied).toBe(true);
    await cancelBookingByUser({ uid: UID, bookingId: a.bookingId, reason: 'plans', comment: '' });
    const next = await createBooking(request());
    expect(next.loyaltyDiscountApplied).toBe(true);
    expect(next.totalAmount).toBe(45);
  });
});

describe('сбои Stripe при создании и продолжении оплаты', () => {
  it('Stripe ещё обрабатывает тот же idempotency key — 409, бронь НЕ освобождается', async () => {
    stripe.checkout.sessions.create = async () => {
      throw Object.assign(new Error('in progress'), { type: 'StripeIdempotencyError', statusCode: 409 });
    };
    const err = await refusal(createBooking(request({}, UID, 'slow')));
    expect(err).toMatchObject({ status: 409, reason: 'checkout_in_progress' });
    const [, b] = store.listDocs('bookings')[0]!;
    expect(b).toMatchObject({ paymentStatus: 'awaiting_online', status: 'pending' });
  });

  it('сессия без URL — 502, ссылки клиенту нет, фальшивого успеха нет', async () => {
    const create = stripe.checkout.sessions.create;
    stripe.checkout.sessions.create = async (params, opts) => ({ ...(await create(params, opts)), url: null });
    const err = await refusal(createBooking(request()));
    expect(err).toMatchObject({ status: 502, reason: 'payment_unavailable' });
  });

  it('бронь отменили, пока создавалась сессия — сессия закрывается, клиенту checkout_expired', async () => {
    const create = stripe.checkout.sessions.create;
    stripe.checkout.sessions.create = async (params, opts) => {
      const s = await create(params, opts);
      const id = String((params as { client_reference_id: string }).client_reference_id);
      store.seed('bookings', id, { ...booking(id), status: 'cancelled' });
      return s;
    };
    const err = await refusal(createBooking(request()));
    expect(err.reason).toBe('checkout_expired');
    const [id] = store.listDocs('bookings')[0]!;
    expect(stripe.sessions.get(`cs_test_1`)!.status).toBe('expired');
    expect(booking(id).stripeCheckoutSessionId).toBeUndefined();
  });

  it('retrieve недоступен при «Продолжить оплату» — 502, бронь не тронута', async () => {
    const a = await createBooking(request());
    stripe.checkout.sessions.retrieve = async () => { throw new Error('timeout'); };
    const err = await refusal((await import('../../server/payments/checkout.service.js')).resumeCheckout(UID, a.bookingId));
    expect(err).toMatchObject({ status: 502, reason: 'payment_unavailable' });
    expect(booking(a.bookingId)).toMatchObject({ paymentStatus: 'awaiting_online', status: 'pending' });
  });

  it('сессия complete, но не оплачена — «обрабатывается», бронь не протухает и не оплачивается', async () => {
    const a = await createBooking(request());
    Object.assign(stripe.sessions.get(String(booking(a.bookingId).stripeCheckoutSessionId))!, { status: 'complete', payment_status: 'unpaid' });
    const r = await (await import('../../server/payments/checkout.service.js')).resumeCheckout(UID, a.bookingId);
    expect(r.checkoutState).toBe('processing');
    expect(booking(a.bookingId).paymentStatus).toBe('awaiting_online');
  });

  it('resume_checkout: мусорный id — 400; чужая оплаченная бронь — 404 без подробностей', async () => {
    const { resumeCheckout } = await import('../../server/payments/checkout.service.js');
    expect((await refusal(resumeCheckout(UID, '../users/x'))).status).toBe(400);
    expect((await refusal(resumeCheckout(UID, 42))).status).toBe(400);
    const a = await createBooking(request());
    stripe.pay(String(booking(a.bookingId).stripeCheckoutSessionId));
    const err = await refusal(resumeCheckout('intruder', a.bookingId));
    expect(err.status).toBe(404);
    // Чужой запрос не подтверждает оплату за владельца и не трогает Stripe.
    expect(booking(a.bookingId).paymentStatus).toBe('awaiting_online');
  });
});

describe('деньги: только целые центы из серверной суммы', () => {
  it('дробные евро не теряют цент (19.99 → 1999, 0.1+0.2 → 30)', async () => {
    const { amountInCents } = await import('../../server/payments/onlinePayment.js');
    expect(amountInCents(19.99)).toBe(1999);
    expect(amountInCents(0.1 + 0.2)).toBe(30);
    expect(amountInCents(45)).toBe(4500);
    expect(Number.isInteger(amountInCents(37.5))).toBe(true);
  });

  it('любой тариф каталога со скидкой лояльности — положительная сумма не меньше минимума Stripe (0,50 €)', async () => {
    const { SHOWS } = await import('../../shared/catalog/shows.js');
    const { loyaltyDiscountForTicket } = await import('../../shared/domain/loyalty.js');
    for (const show of Object.values(SHOWS)) {
      for (const t of Object.values(show.tickets) as Array<{ price: number }>) {
        expect(Number.isInteger(t.price)).toBe(true);
        expect(t.price - loyaltyDiscountForTicket(t.price)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('сумма без totalAmount или с NaN никогда не подтверждается', async () => {
    const { decidePayment } = await import('../../server/payments/onlinePayment.js');
    const view = {
      bookingId: 'b1', paymentMethod: 'online', paymentStatus: 'awaiting_online', status: 'pending',
      totalAmount: NaN, stripeCheckoutSessionId: 'cs', stripePaymentIntentId: null, paymentIssue: null,
      refund: null, refunds: {},
    };
    const s = {
      id: 'cs', bookingId: 'b1', clientReferenceId: 'b1', metadataBookingId: 'b1', status: 'complete',
      paymentStatus: 'paid', amountTotal: 0, currency: 'eur', paymentIntentId: 'pi', expiresAtMs: 0, url: null, livemode: false,
    };
    expect(decidePayment(view, s).kind).toBe('amount_mismatch');
    expect(decidePayment({ ...view, totalAmount: 45 }, { ...s, amountTotal: null }).kind).toBe('amount_mismatch');
    expect(decidePayment({ ...view, totalAmount: 45 }, { ...s, amountTotal: 4500, currency: 'usd' }).kind).toBe('amount_mismatch');
    expect(decidePayment({ ...view, totalAmount: 45 }, { ...s, amountTotal: 4500 }).kind).toBe('confirm');
  });
});

describe('прежние способы оплаты не задеты Stripe', () => {
  it('на месте и перевод: Stripe не вызывается, статусы как раньше, ссылки на оплату нет', async () => {
    const onSite   = await createBooking(request({ paymentMethod: 'on_site' }));
    const transfer = await createBooking(request({ paymentMethod: 'bank_transfer' }));
    expect(stripe.created).toHaveLength(0);
    expect(onSite.checkoutUrl).toBeUndefined();
    expect(transfer.checkoutUrl).toBeUndefined();
    expect(booking(onSite.bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'not_paid', paymentMethod: 'on_site' });
    expect(booking(onSite.bookingId).paymentExpiresAt).toBeUndefined();
    expect(booking(transfer.bookingId)).toMatchObject({ paymentStatus: 'awaiting_transfer', paymentMethod: 'bank_transfer' });
    expect(transfer.paymentReference).toMatch(/^TETEATETE-/);
  });

  it('при выключенном онлайн-приёме наличные и перевод работают', async () => {
    onlineEnabled = false;
    const r = await createBooking(request({ paymentMethod: 'on_site' }));
    expect(r.ok).toBe(true);
  });

  it('наличные: «Оплачено» на входе, «Не оплачено», отмена администратором — как раньше', async () => {
    const r = await createBooking(request({ paymentMethod: 'on_site' }));
    const code = String(booking(r.bookingId).ticketCode);
    await checkinTicket({ adminUid: 'admin-1', ticketCode: code, action: 'mark_paid' });
    expect(booking(r.bookingId)).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', paidBy: 'admin-1' });
    await markUnpaidByAdmin(r.bookingId);
    expect(booking(r.bookingId).paymentStatus).toBe('not_paid');
    await cancelBookingByAdmin('admin-1', r.bookingId);
    expect(booking(r.bookingId).status).toBe('cancelled');
    expect(stripe.created).toHaveLength(0);
  });

  it('старая бронь без paymentMethod: отмена администратором не обращается к Stripe', async () => {
    store.seed('bookings', 'legacy', {
      userId: 'old', showId: SHOW, showDate: '02 Окт 2026', showTime: '20:00',
      status: 'confirmed', paymentStatus: 'paid', ticketsCount: 1, totalAmount: 30, ticketCode: 'LEGA-CY23',
    });
    await cancelBookingByAdmin('admin-1', 'legacy');
    expect(booking('legacy').status).toBe('cancelled');
    expect(stripe.created).toHaveLength(0);
  });
});

describe('проход: только действующая оплаченная бронь', () => {
  const seedAt = (id: string, code: string, patch: Record<string, unknown>) => store.seed('bookings', id, {
    userId: UID, showId: SHOW, showDate: '02 Окт 2026', showTime: '20:00', ticketsCount: 1, totalAmount: 30,
    paymentMethod: 'online', ticketCode: code, stripePaymentIntentId: 'pi_x', ...patch,
  });

  it.each([
    ['awaiting_online',            { status: 'pending',   paymentStatus: 'awaiting_online' }, 'not_paid'],
    ['expired',                    { status: 'cancelled', paymentStatus: 'expired' },         'cancelled'],
    ['refunded',                   { status: 'cancelled', paymentStatus: 'refunded' },        'cancelled'],
    ['paid_after_cancel',          { status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'paid_after_cancel' }, 'cancelled'],
    ['refund_failed + cancelled',  { status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'refund_failed', refund: { id: 're', status: 'failed' } }, 'cancelled'],
    ['refund pending',             { status: 'cancelled', paymentStatus: 'paid', refund: { id: 're', status: 'pending' } }, 'cancelled'],
  ])('%s — проход запрещён', async (_name, patch, reason) => {
    seedAt('x', 'WXYZ-2345', patch);
    const err = await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'WXYZ-2345', action: 'mark_attended', showId: SHOW }));
    expect(err.reason).toBe(reason);
    expect(booking('x').status).toBe(patch.status);
  });

  it('оплаченная онлайн — проходит один раз, повтор — already_attended; чужой спектакль — wrong_show', async () => {
    seedAt('ok', 'PAID-2345', { status: 'confirmed', paymentStatus: 'paid' });
    const other = Object.keys((await import('../../shared/catalog/shows.js')).SHOWS).find(id => id !== SHOW)!;
    expect((await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'PAID-2345', action: 'mark_attended', showId: other }))).reason)
      .toBe('wrong_show');
    const r = await checkinTicket({ adminUid: 'admin-1', ticketCode: 'PAID-2345', action: 'mark_attended', showId: SHOW });
    expect(r.changed).toBe(true);
    expect((await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'PAID-2345', action: 'mark_attended', showId: SHOW }))).reason)
      .toBe('already_attended');
  });
});
