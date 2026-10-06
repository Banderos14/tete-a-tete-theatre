// Ограниченный режим продаж (shared/catalog/salesMode.ts).
//
// Театр временно продаёт билеты только на «Крошку Енота» и «Красную Шапочку».
// Остальные спектакли видны везде, но новые брони и оплаты на них закрыты —
// и в интерфейсе, и на сервере. Существующие брони, билеты, проход и история
// не меняются. Возврат к обычной работе — SALES_MODE = 'normal'.
//
// Серверная часть проверяется поведением поверх in-memory Firestore и
// фейкового Stripe — в реальном (ограниченном) режиме, без подмены модуля.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { projectSource } from '../helpers/serverSource.js';
import {
  SALES_MODE, LIMITED_SALES_ALLOWLIST, isShowBookingEnabled, isShowSalesPaused, isLimitedSalesMode,
  BOOKING_TEMPORARILY_UNAVAILABLE,
} from '../../shared/catalog/salesMode';
import { SEASON_CATALOG, SHOWS as CATALOG_SHOWS, showStartUtcMs } from '../../shared/catalog/shows';
import { PUBLISHED_SHOWS, PUBLISHED_REPERTOIRE, SHOWS as FRONT_SHOWS } from '../../src/data/shows';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';

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
vi.mock('../../server/shared/rateLimit.js', () => ({
  consumeRateLimit: async () => ({ allowed: true, resetAtMs: 0 }),
}));

// ── Фейковый Stripe: только то, что нужно сценариям ниже ────────────────────

type FakeSession = {
  id: string; object: 'checkout.session'; url: string | null; status: string; payment_status: string;
  amount_total: number; currency: string; client_reference_id: string | null;
  metadata: Record<string, string>; payment_intent: string | null; expires_at: number; livemode: boolean;
};

class FakeStripe {
  sessions = new Map<string, FakeSession>();
  created: Array<Record<string, unknown>> = [];
  private n = 0;
  checkout = { sessions: {
    create: async (params: Record<string, unknown>) => {
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
      this.created.push(params);
      return s;
    },
    retrieve: async (id: string) => {
      const s = this.sessions.get(id);
      if (!s) throw new Error('No such checkout.session');
      return s;
    },
    expire: async (id: string) => {
      const s = this.sessions.get(id)!;
      s.status = 'expired';
      return s;
    },
  } };
  /** Сессия, созданная до перехода в ограниченный режим. */
  seed(id: string, bookingId: string, amount: number, expiresAtMs: number, paid = false) {
    this.sessions.set(id, {
      id, object: 'checkout.session', url: paid ? null : `https://checkout.stripe.test/${id}`,
      status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid',
      amount_total: amount * 100, currency: 'eur', client_reference_id: bookingId,
      metadata: { bookingId }, payment_intent: paid ? 'pi_old' : null,
      expires_at: Math.floor(expiresAtMs / 1000), livemode: false,
    });
  }
}

let stripe = new FakeStripe();
vi.mock('../../server/payments/stripe.client.js', () => ({
  getStripe:              () => stripe,
  isOnlinePaymentEnabled: () => true,
  expectedLivemode:       () => false,
}));

// HTTP-обвязка handler'а
let requestBody = '';
const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
vi.mock('../../server/shared/http.js', () => ({
  readBody: async () => requestBody,
  respond:  (_res: unknown, status: number, body: Record<string, unknown>) => { responses.push({ status, body }); },
}));
vi.mock('../../server/shared/auth.js', () => ({
  requireCaller: async () => ({ uid: UID, idToken: 't' }),
  requireAdmin:  async () => ({ uid: 'admin-1', idToken: 't' }),
}));

const { createBooking }         = await import('../../server/booking/booking.service.js');
const { validateCreateBooking } = await import('../../server/booking/booking.validation.js');
const { resumeCheckout }        = await import('../../server/payments/checkout.service.js');
const { cancelBookingByUser }   = await import('../../server/booking/cancellation.service.js');
const { checkinTicket }         = await import('../../server/checkin/checkin.service.js');
const { readShowAvailability }  = await import('../../server/availability/availability.service.js');
const { readPublicTicket }      = await import('../../server/booking/publicTicket.service.js');
const { default: createHandler } = await import('../../api/create-booking.js');
const { ApiError }              = await import('../../server/shared/errors.js');

const ROOT = resolve(__dirname, '../..');
const UID  = 'user-anna';
const NOW  = new Date('2026-09-20T10:00:00Z');
const MIN  = 60 * 1000;
const ALLOWED = ['enot', 'shapochka'];
// Все опубликованные спектакли, кроме двух разрешённых, — продажи закрыты.
const BLOCKED = Object.keys(CATALOG_SHOWS).filter(id => !ALLOWED.includes(id));
// Из них ещё не прошедшие на NOW — у прошедших раньше срабатывает show_started.
const BLOCKED_FUTURE = BLOCKED.filter(id => (showStartUtcMs(CATALOG_SHOWS[id]!) ?? 0) > NOW.getTime());

const request = (showId: string, body: Record<string, unknown> = {}) => ({
  ...validateCreateBooking({
    showId, items: [{ ticketType: Object.keys(CATALOG_SHOWS[showId]!.tickets)[0], quantity: 2 }],
    paymentMethod: 'online', comment: '', phone: '+33 6 12 34 56 78', lang: 'RU', ...body,
  }),
  uid: UID,
  idempotencyKeyRaw: null,
});

async function refusal(p: Promise<unknown>): Promise<InstanceType<typeof ApiError>> {
  try { await p; } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('ожидался отказ');
}

/** Бронь, созданная до перехода в ограниченный режим. */
function seedBooking(id: string, showId: string, fields: Record<string, unknown>) {
  const show = SEASON_CATALOG[showId]!;
  store.seed('bookings', id, {
    userId: UID, showId, showTitle: show.title, showDate: `${show.day} ${show.month} ${show.year}`,
    showTime: show.time, ticketType: 'standard', ticketsCount: 2, seatsCount: 2, totalAmount: 60,
    lang: 'RU', userEmail: 'anna@example.com', ...fields,
  });
}

beforeEach(() => {
  store  = new MemoryFirestore();
  stripe = new FakeStripe();
  responses.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('PUBLIC_SITE_URL', 'https://staging.example.test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Конфигурация ────────────────────────────────────────────────────────────

describe('режим продаж: один источник правды', () => {
  it('сейчас включён ограниченный режим; разрешены «Крошка Енот» и «Красная Шапочка»', () => {
    expect(SALES_MODE).toBe('limited');
    expect(isLimitedSalesMode()).toBe(true);
    expect([...LIMITED_SALES_ALLOWLIST].sort()).toEqual([...ALLOWED].sort());
    expect(SEASON_CATALOG.enot!.title).toBe('«Крошка Енот»');
    expect(SEASON_CATALOG.shapochka!.title).toBe('«Красная Шапочка»');
  });

  it('allowlist — только настоящие опубликованные id каталога', () => {
    for (const id of LIMITED_SALES_ALLOWLIST) {
      expect(Object.hasOwn(SEASON_CATALOG, id)).toBe(true);
      expect(SEASON_CATALOG[id]!.published).toBe(true);
    }
  });

  it('limited: «Крошка Енот» и «Красная Шапочка» бронируются', () => {
    expect(isShowBookingEnabled('enot')).toBe(true);
    expect(isShowBookingEnabled('shapochka')).toBe(true);
    expect(isShowSalesPaused('enot')).toBe(false);
    expect(isShowSalesPaused('shapochka')).toBe(false);
  });

  it('limited: каждый другой опубликованный спектакль закрыт', () => {
    expect(BLOCKED.length).toBeGreaterThan(0);
    for (const id of BLOCKED) {
      expect(isShowBookingEnabled(id), id).toBe(false);
      expect(isShowSalesPaused(id), id).toBe(true);
    }
  });

  it('limited: новый спектакль не продаётся, пока его не впишут в allowlist (deny by default)', () => {
    // Имитация: спектакль опубликован, но в allowlist его нет.
    expect(isShowBookingEnabled('romantika', 'limited', ['enot'])).toBe(false);
    expect(isShowBookingEnabled('romantika', 'limited', ['enot', 'romantika'])).toBe(true);
  });

  it('allowlist не воскрешает заготовку и неизвестный id — ни в каком режиме', () => {
    expect(SEASON_CATALOG.letuchiy!.published).toBe(false);
    for (const mode of ['normal', 'limited'] as const) {
      expect(isShowBookingEnabled('letuchiy', mode, ['letuchiy'])).toBe(false);
      expect(isShowBookingEnabled('nope', mode, ['nope'])).toBe(false);
      expect(isShowBookingEnabled('__proto__', mode)).toBe(false);
      // Не «приостановлено», а просто не продаётся: заготовки нет на сайте.
      expect(isShowSalesPaused('letuchiy', mode)).toBe(false);
    }
  });

  it('normal: всё как до ограниченного режима — продаются все опубликованные спектакли', () => {
    expect(isLimitedSalesMode('normal')).toBe(false);
    for (const id of Object.keys(CATALOG_SHOWS)) {
      expect(isShowBookingEnabled(id, 'normal'), id).toBe(true);
      expect(isShowSalesPaused(id, 'normal'), id).toBe(false);
    }
  });

  it('режим не меняет публикацию: закрытые спектакли остаются published', () => {
    for (const id of BLOCKED) expect(SEASON_CATALOG[id]!.published, id).toBe(true);
  });
});

// ── Сервер: новые брони ─────────────────────────────────────────────────────

describe('сервер: создание брони в ограниченном режиме', () => {
  it('на дату теста есть будущие закрытые спектакли', () => {
    expect(BLOCKED_FUTURE.length).toBeGreaterThanOrEqual(4);
  });

  it.each(BLOCKED_FUTURE)('«%s»: любая оплата — 409 booking_temporarily_unavailable, брони и сессии нет', async (showId) => {
    for (const paymentMethod of ['online', 'on_site', 'bank_transfer']) {
      const err = await refusal(createBooking(request(showId, { paymentMethod })));
      expect(err.status).toBe(409);
      expect(err.reason).toBe(BOOKING_TEMPORARILY_UNAVAILABLE);
    }
    expect(store.listDocs('bookings')).toHaveLength(0);
    expect(stripe.created).toHaveLength(0);
  });

  it('прямой вызов API (старая вкладка, ручной запрос) — тот же контролируемый отказ, не 500', async () => {
    requestBody = JSON.stringify({
      showId: 'shutka', ticketType: 'standard', ticketsCount: 1, paymentMethod: 'on_site',
      phone: '+33 6 12 34 56 78', comment: '', lang: 'FR',
    });
    await createHandler({ method: 'POST', headers: {} } as never, {} as never);
    expect(responses.at(-1)).toEqual({
      status: 409,
      body: { error: 'Booking for this show is temporarily unavailable', reason: BOOKING_TEMPORARILY_UNAVAILABLE },
    });
    expect(store.listDocs('bookings')).toHaveLength(0);
  });

  it('прошедший закрытый спектакль — по-прежнему show_started; заготовка и мусорный id — 400', async () => {
    vi.setSystemTime(new Date('2026-10-03T10:00:00Z')); // «И в шутку, и всерьёз» уже прошёл
    expect((await refusal(createBooking(request('shutka')))).reason).toBe('show_started');
    expect(() => validateCreateBooking({ showId: 'letuchiy', ticketType: 'standard', ticketsCount: 1,
      paymentMethod: 'on_site', phone: '+33 6 12 34 56 78' })).toThrow('Invalid showId');
    expect(() => validateCreateBooking({ showId: 'nope', ticketType: 'standard', ticketsCount: 1,
      paymentMethod: 'on_site', phone: '+33 6 12 34 56 78' })).toThrow('Invalid showId');
  });

  it.each(ALLOWED)('«%s»: онлайн-оплата работает как раньше — бронь, одна сессия Stripe, ссылка', async (showId) => {
    const res = await createBooking(request(showId));
    expect(res.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(stripe.created).toHaveLength(1);
    expect(store.peek('bookings', res.bookingId)).toMatchObject({
      showId, status: 'pending', paymentStatus: 'awaiting_online', paymentMethod: 'online',
    });
    // Цена — из каталога: 2 × детский 20 € = 40 €.
    expect(res.totalAmount).toBe(40);
  });

  it.each(ALLOWED)('«%s»: оплата на месте и смешанная корзина работают как раньше', async (showId) => {
    const res = await createBooking(request(showId, {
      paymentMethod: 'on_site', items: [{ ticketType: 'child', quantity: 1 }, { ticketType: 'family', quantity: 1 }],
    }));
    expect(res.totalAmount).toBe(65);
    expect(store.peek('bookings', res.bookingId)).toMatchObject({ seatsCount: 4, ticketsCount: 2, paymentMethod: 'on_site' });
    expect(stripe.created).toHaveLength(0);
  });

  it('остаток мест: закрытый спектакль существует, но bookingEnabled: false', async () => {
    const availability = await readShowAvailability();
    for (const id of BLOCKED) expect(availability[id], id).toMatchObject({ capacity: 50, bookingEnabled: false });
    for (const id of ALLOWED) expect(availability[id], id).toMatchObject({ capacity: 50, bookingEnabled: true });
  });
});

// ── Сервер: незавершённая онлайн-оплата ─────────────────────────────────────

describe('сервер: «Продолжить оплату» в ограниченном режиме', () => {
  const holdMs = () => NOW.getTime() + 25 * MIN;

  it('открытая сессия закрытого спектакля — ссылку не отдаём, бронь не трогаем', async () => {
    seedBooking('b-open', 'shutka', {
      paymentMethod: 'online', status: 'pending', paymentStatus: 'awaiting_online',
      stripeCheckoutSessionId: 'cs_old', paymentExpiresAt: { seconds: holdMs() / 1000 },
    });
    stripe.seed('cs_old', 'b-open', 60, holdMs());

    const err = await refusal(resumeCheckout(UID, 'b-open'));
    expect(err.status).toBe(409);
    expect(err.reason).toBe(BOOKING_TEMPORARILY_UNAVAILABLE);
    expect(store.peek('bookings', 'b-open')).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_online' });
    expect(stripe.sessions.get('cs_old')!.status).toBe('open');
  });

  it('бронь без сессии — новую сессию Stripe не создаём', async () => {
    seedBooking('b-nosession', 'razgovor', {
      paymentMethod: 'online', status: 'pending', paymentStatus: 'awaiting_online',
      paymentExpiresAt: { seconds: (NOW.getTime() + 35 * MIN) / 1000 },
    });
    const err = await refusal(resumeCheckout(UID, 'b-nosession'));
    expect(err.reason).toBe(BOOKING_TEMPORARILY_UNAVAILABLE);
    expect(stripe.created).toHaveLength(0);
    expect(store.peek('bookings', 'b-nosession')).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_online' });
  });

  it('оплата уже прошла в Stripe — сверка работает: бронь становится оплаченной', async () => {
    seedBooking('b-paid', 'shutka', {
      paymentMethod: 'online', status: 'pending', paymentStatus: 'awaiting_online',
      stripeCheckoutSessionId: 'cs_paid', paymentExpiresAt: { seconds: holdMs() / 1000 },
    });
    stripe.seed('cs_paid', 'b-paid', 60, holdMs(), true);
    const res = await resumeCheckout(UID, 'b-paid');
    expect(res.checkoutState).toBe('paid');
    expect(store.peek('bookings', 'b-paid')).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });

  it('разрешённый спектакль — «Продолжить оплату» отдаёт ссылку той же сессии', async () => {
    const created = await createBooking(request('enot'));
    const res = await resumeCheckout(UID, created.bookingId);
    expect(res).toMatchObject({ checkoutState: 'open', checkoutUrl: created.checkoutUrl });
    expect(stripe.created).toHaveLength(1);
  });

  it('через handler: action resume_checkout — 409 с причиной, не 500', async () => {
    seedBooking('b-h', 'kovcheg', {
      paymentMethod: 'online', status: 'pending', paymentStatus: 'awaiting_online',
      stripeCheckoutSessionId: 'cs_h', paymentExpiresAt: { seconds: holdMs() / 1000 },
    });
    stripe.seed('cs_h', 'b-h', 60, holdMs());
    requestBody = JSON.stringify({ action: 'resume_checkout', bookingId: 'b-h' });
    await createHandler({ method: 'POST', headers: {} } as never, {} as never);
    expect(responses.at(-1)).toMatchObject({ status: 409, body: { reason: BOOKING_TEMPORARILY_UNAVAILABLE } });
  });
});

// ── Существующие брони не ломаются ──────────────────────────────────────────

describe('существующие брони закрытых спектаклей', () => {
  it('оплаченный билет: публичная страница, проверка на входе и проход работают', async () => {
    seedBooking('b-ticket', 'shutka', {
      ticketCode: 'PKX3-E222', paymentMethod: 'on_site', status: 'confirmed', paymentStatus: 'paid',
    });
    const ticket = await readPublicTicket('PKX3-E222', '1.2.3.4');
    expect(ticket).toMatchObject({ code: 'PKX3-E222' });

    const inspect = await checkinTicket({ adminUid: 'admin-1', ticketCode: 'PKX3-E222', action: 'inspect', showId: 'shutka' });
    expect(inspect.booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });

    vi.setSystemTime(new Date('2026-10-02T17:45:00Z'));
    const pass = await checkinTicket({ adminUid: 'admin-1', ticketCode: 'PKX3-E222', action: 'mark_attended', showId: 'shutka' });
    expect(pass.changed).toBe(true);
    expect(store.peek('bookings', 'b-ticket')).toMatchObject({ status: 'attended', paymentStatus: 'paid' });
  });

  it('зритель может отменить свою неоплаченную бронь — как раньше', async () => {
    seedBooking('b-cancel', 'lubov', {
      ticketCode: 'AAAA-BBBB', paymentMethod: 'on_site', status: 'confirmed', paymentStatus: 'not_paid',
    });
    const res = await cancelBookingByUser({ uid: UID, bookingId: 'b-cancel', reason: 'plans' } as never);
    expect(res.status).toBe('cancelled');
  });

  it('статусы существующих броней ограниченный режим не меняет', async () => {
    seedBooking('b-keep', 'romantika', { paymentMethod: 'bank_transfer', status: 'pending', paymentStatus: 'awaiting_transfer' });
    await readShowAvailability();
    await refusal(createBooking(request('romantika')));
    expect(store.peek('bookings', 'b-keep')).toMatchObject({ status: 'pending', paymentStatus: 'awaiting_transfer' });
  });

  it('модуль режима не используют отмена, проход, публичный билет, письма, webhook и лояльность', () => {
    for (const file of [
      'server/booking/cancellation.service.ts', 'server/checkin/checkin.service.ts', 'server/checkin/group.service.ts',
      'server/booking/publicTicket.service.ts', 'server/email/ticketEmail.service.ts', 'server/payments/webhook.service.ts',
      'server/payments/reconcile.service.ts', 'server/payments/refundSync.service.ts', 'server/booking/loyalty.ts',
      'server/expiration/expiration.service.ts', 'server/admin/adminBooking.service.ts',
      'src/components/ui/TicketCard/TicketCard.tsx', 'src/pages/TicketCheckPage/checkinShows.ts',
    ]) {
      expect(projectSource(file), file).not.toContain('salesMode');
    }
  });
});

// ── Интерфейс ───────────────────────────────────────────────────────────────

describe('интерфейс: закрытые спектакли видны, но не продаются', () => {
  it('Афиша показывает все опубликованные спектакли, включая закрытые', () => {
    const ids = PUBLISHED_SHOWS.map(s => s.id);
    for (const id of [...BLOCKED, ...ALLOWED]) expect(ids, id).toContain(id);
  });

  it('Репертуар показывает все спектакли, включая закрытые', () => {
    const ids = PUBLISHED_REPERTOIRE.map(r => r.id);
    for (const id of [...BLOCKED, ...ALLOWED]) expect(ids, id).toContain(id);
  });

  it('Афиша, модалка спектакля и Репертуар берут признак из одного helper', () => {
    const slider = projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.tsx');
    const modal  = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    const rep    = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    for (const src of [slider, modal, rep]) {
      expect(src).toContain("from '../../../../../shared/catalog/salesMode'");
      expect(src).toContain('isShowSalesPaused(');
      // Никаких условий по конкретным id в компонентах.
      expect(src).not.toMatch(/'enot'|'shapochka'/);
    }
  });

  it('кнопка закрытого спектакля неактивна, без «купить»-hover и ничего не открывает', () => {
    const modal = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    expect(modal).toContain('<button type="button" className={styles.pausedBtn} disabled');
    expect(modal).toContain('{t.sales.unavailableCta}');
    expect(modal).toContain('{t.sales.pausedStatus}');
    // Неактивная кнопка — не .btn (у неё hover-заливка и тень «купить»).
    expect(modal).not.toMatch(/btn btn-primary[^"]*pausedBtn/);
    const rep = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    expect(rep).toContain('<button type="button" className={styles.modalPausedBtn} disabled');
    const scss = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.module.scss');
    expect(scss).toMatch(/\.pausedBtn \{[^}]*cursor: not-allowed/);
  });

  it('форма брони (старая вкладка) не отправляет запрос и понимает отказ сервера', () => {
    const bm = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(bm).toContain('if (salesPaused) { setSubmitError(t.sales.bookingPaused); return; }');
    expect(bm).toContain('apiErr?.reason === BOOKING_TEMPORARILY_UNAVAILABLE');
    const step = projectSource('src/components/ui/BookingModal/BookingFormStep.tsx');
    expect(step).toContain('disabled={busy || ticketsCount < 1 || soldOut || salesPaused}');
  });

  it('«Мои билеты»: вместо «Продолжить оплату» — «Оплата временно недоступна»', () => {
    const card = projectSource('src/components/ui/ProfileDrawer/BookingCard.tsx');
    expect(card).toContain('const paymentPaused      = isShowSalesPaused(b.showId);');
    expect(card).toContain('{canResumeCheckout(b) && paymentPaused && (');
    expect(card).toContain('{t.sales.paymentPaused}');
    const ret = projectSource('src/components/ui/CheckoutReturnModal/CheckoutReturnModal.tsx');
    expect(ret).toContain("{view === 'not_completed' && !paymentPaused && (");
  });

  it('бегущая строка не обещает «Бронирование открыто» в ограниченном режиме', () => {
    const marquee = projectSource('src/pages/HomePage/sections/Marquee/Marquee.tsx');
    expect(marquee).toContain('bookingOpen: isLimitedSalesMode() ? null : t.marqueeBookingOpen,');
    expect(RU.marquee).not.toContain('Бронирование открыто');
    expect(FR.marquee).not.toContain('Réservations ouvertes');
  });

  it('общего баннера об ограниченном режиме нет — ни у Афиши, ни у Репертуара', () => {
    expect(existsSync(resolve(ROOT, 'src/components/ui/SalesModeNotice'))).toBe(false);
    for (const file of [
      'src/pages/HomePage/sections/Afisha/Afisha.tsx', 'src/pages/HomePage/sections/Repertoire/Repertoire.tsx',
      'src/pages/HomePage/HomePage.tsx',
    ]) {
      expect(projectSource(file), file).not.toMatch(/SalesModeNotice|noticeTitle|noticeText/);
    }
    expect(RU.sales).not.toHaveProperty('noticeTitle');
    expect(FR.sales).not.toHaveProperty('noticeText');
  });
});

describe('админка: спектакли и брони на месте, статус продаж честный', () => {
  it('закрытый спектакль остаётся в списке админки с меткой «Продажи приостановлены»', async () => {
    // NOW = 20 сентября: все закрытые, кроме «Романтики» (17.09), ещё впереди.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { AdminShowCard } = await import('../../src/pages/AdminPage/AdminShowCard');
    const { adminShowList, summarizeByShow } = await import('../../src/pages/AdminPage/adminStats');
    const stats = summarizeByShow(adminShowList(FRONT_SHOWS, []), []);
    const render = (id: string) => renderToStaticMarkup(createElement(AdminShowCard, {
      stats: stats.find(s => s.show.id === id)!, active: false, onToggle: () => {},
    }));
    for (const id of BLOCKED_FUTURE) expect(render(id), id).toContain('Продажи приостановлены');
    for (const id of ALLOWED) expect(render(id), id).not.toContain('Продажи приостановлены');
    // Прошедший спектакль в админке остаётся, но без метки «приостановлены».
    expect(render('romantika')).toContain('Романтика');
    expect(render('romantika')).not.toContain('Продажи приостановлены');
  });
});

describe('тексты RU / FR', () => {
  it('RU', () => {
    expect(RU.sales).toEqual({
      unavailableCta: 'Временно недоступно',
      pausedStatus:   'Бронирование временно приостановлено',
      bookingPaused:  'Бронирование на этот спектакль временно приостановлено.',
      paymentPaused:  'Оплата временно недоступна',
    });
    expect(RU.admin.salesPaused).toBe('Продажи приостановлены');
  });

  it('FR', () => {
    expect(FR.sales).toEqual({
      unavailableCta: 'Temporairement indisponible',
      pausedStatus:   'Réservations temporairement suspendues',
      bookingPaused:  'Les réservations pour ce spectacle sont temporairement suspendues.',
      paymentPaused:  'Paiement temporairement indisponible',
    });
    expect(FR.admin.salesPaused).toBe('Ventes suspendues');
  });
});
