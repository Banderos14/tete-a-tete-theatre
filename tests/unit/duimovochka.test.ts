// «Дюймовочка» — 22 ноября 2026, 11:00 (Europe/Paris), два своих тарифа.
//
// Контракт новой постановки: одна запись каталога (без дубликатов), ровно два
// тарифа с ценами, которые считает сервер; продажа в ограниченном режиме;
// показ в Афише, Репертуаре, бегущей строке и админке; ссылки «сразу к брони
// с тарифом». Серверный путь проверяется поверх in-memory Firestore и
// фейкового Stripe — как в salesMode.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { projectSource } from '../helpers/serverSource.js';
import {
  SEASON_CATALOG, SHOWS as CATALOG_SHOWS, THEATRE_CAPACITY, showDateString, showStartUtcMs,
} from '../../shared/catalog/shows';
import { SALES_MODE, LIMITED_SALES_ALLOWLIST, isShowBookingEnabled, isShowSalesPaused } from '../../shared/catalog/salesMode';
import { ticketTypeLabel, ticketBreakdownLabel } from '../../shared/catalog/ticketTypes';
import { priceBasket, catalogTariffs } from '../../shared/domain/ticketBasket';
import { buildTicketEmail } from '../../shared/email/ticketEmail';
import { SHOWS as FRONT_SHOWS, PUBLISHED_REPERTOIRE, afishaShows, isShowPast } from '../../src/data/shows';
import { marqueeShowItems } from '../../src/pages/HomePage/sections/Marquee/marqueeItems';
import { AdminShowCard } from '../../src/pages/AdminPage/AdminShowCard';
import { adminShowList, summarizeByShow } from '../../src/pages/AdminPage/adminStats';
import { AfishaSlider } from '../../src/pages/HomePage/sections/Afisha/AfishaSlider';
import { LangContext } from '../../src/i18n/LangContext';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import {
  resolveBookingDeepLink, getShowTariffBookingUrl, getTariffFromLocation, initialBasketLines, TARIFF_PARAM,
} from '../../src/utils/bookingDeepLink';
import { getShowIdFromLocation } from '../../src/utils/showUrl';

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

// Фейковый Stripe: запоминает параметры сессии — по ним проверяются line items.
class FakeStripe {
  created: Array<Record<string, unknown>> = [];
  private n = 0;
  checkout = { sessions: {
    create: async (params: Record<string, unknown>) => {
      const id = `cs_test_${++this.n}`;
      const items = params.line_items as Array<{ price_data: { unit_amount: number; currency: string } }>;
      this.created.push(params);
      return {
        id, object: 'checkout.session', url: `https://checkout.stripe.test/${id}`, status: 'open',
        payment_status: 'unpaid', amount_total: items[0]!.price_data.unit_amount,
        currency: items[0]!.price_data.currency, client_reference_id: params.client_reference_id,
        metadata: params.metadata, payment_intent: null, expires_at: params.expires_at, livemode: false,
      };
    },
    retrieve: async () => { throw new Error('not used'); },
    expire:   async () => { throw new Error('not used'); },
  } };
}
let stripe = new FakeStripe();
vi.mock('../../server/payments/stripe.client.js', () => ({
  getStripe:              () => stripe,
  isOnlinePaymentEnabled: () => true,
  expectedLivemode:       () => false,
}));

const { createBooking }         = await import('../../server/booking/booking.service.js');
const { validateCreateBooking } = await import('../../server/booking/booking.validation.js');
const { readShowAvailability }  = await import('../../server/availability/availability.service.js');

const ID   = 'duimovochka';
const UID  = 'user-anna';
const NOW  = new Date('2026-11-05T10:00:00Z');
const ms   = (iso: string) => new Date(iso).getTime();
const show = SEASON_CATALOG[ID]!;
const front = FRONT_SHOWS.find(s => s.id === ID)!;

const request = (items: Array<{ ticketType: string; quantity: number }>, body: Record<string, unknown> = {}) => ({
  ...validateCreateBooking({
    showId: ID, items, paymentMethod: 'on_site', comment: '', phone: '+33 6 12 34 56 78', lang: 'RU', ...body,
  }),
  uid: UID,
  idempotencyKeyRaw: null,
});

beforeEach(() => {
  store  = new MemoryFirestore();
  stripe = new FakeStripe();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('PUBLIC_SITE_URL', 'https://staging.example.test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Каталог ────────────────────────────────────────────────────────────────

describe('каталог: одна постановка, одна дата', () => {
  it('canonical showId — duimovochka, запись ровно одна, дубликата нет', () => {
    const byTitle = Object.entries(SEASON_CATALOG).filter(([, s]) => /Дюймовочка/.test(s.title));
    expect(byTitle.map(([id]) => id)).toEqual([ID]);
    expect(FRONT_SHOWS.filter(s => s.id === ID)).toHaveLength(1);
    expect(PUBLISHED_REPERTOIRE.filter(r => r.id === ID)).toHaveLength(1);
  });

  it('названия RU / FR («Poucette» — рабочий перевод)', () => {
    expect(show.title).toBe('«Дюймовочка»');
    expect(show.titleFR).toBe('«Poucette»');
    expect(front.titleFR).toBe('«Poucette»');
  });

  it('22.11.2026, 11:00 по Парижу = 10:00 UTC (зимнее время, CET)', () => {
    expect([show.day, show.month, show.year, show.time]).toEqual(['22', 'Ноя', '2026', '11:00']);
    expect(showDateString(show)).toBe('22 Ноя 2026');
    expect(showStartUtcMs(show)).toBe(ms('2026-11-22T10:00:00Z'));
    expect(new Date(showStartUtcMs(show)!).getUTCDay()).toBe(0); // воскресенье
    expect([front.date, front.time]).toEqual(['22.11', '11:00']);
  });

  it('опубликована; вместимость — общий зал, отдельной не заведено', () => {
    expect(show.published).toBe(true);
    expect(CATALOG_SHOWS).toHaveProperty(ID);
    expect(front.totalSeats).toBe(THEATRE_CAPACITY);
    expect(THEATRE_CAPACITY).toBe(50);
  });

  it('официальная афиша театра — одна и та же в Афише, Репертуаре и модалке; заглушки нет', () => {
    expect(front.image).toMatch(/duimovochka.*\.webp$/);
    expect(front.photos).toBeUndefined();
    expect(PUBLISHED_REPERTOIRE.find(r => r.id === ID)!.image).toBe(front.image);
    // Возраст и длительность театр не указал — не выдуманы.
    expect(front.age).toBe('');
    expect(front.duration).toBe('Продолжительность уточняется');
    expect(front.durationFR).toBe('Durée à confirmer');
  });

  it('официальное описание: текст театра дословно, по абзацам; FR — перевод', () => {
    expect(front.desc.startsWith('Детская театральная студия культурно-образовательного центра «Созвездие» приглашает на спектакль «Дюймовочка»!')).toBe(true);
    expect(front.desc).toContain('научиться верить в себя, найти настоящих друзей и отстоять право быть счастливой.');
    expect(front.desc.endsWith('Приходите всей семьёй увидеть, как оживает сказка!')).toBe(true);
    expect(front.desc.split('\n\n')).toHaveLength(5);
    expect(front.descFR.split('\n\n')).toHaveLength(5);
    expect(front.descFR).toContain('Poucette');
    expect(front.descFR).not.toMatch(/[А-Яа-яЁё]/);
    expect(PUBLISHED_REPERTOIRE.find(r => r.id === ID)!.description).toBe(front.desc);
  });
});

// ── Тарифы ─────────────────────────────────────────────────────────────────

describe('тарифы: ровно два, свои у «Дюймовочки»', () => {
  const TARIFFS = catalogTariffs(show.tickets);

  it('«Дети „Созвездия“» 10 € и «Обычный билет» 15 €, по одному месту', () => {
    expect(Object.keys(show.tickets)).toEqual(['constellation', 'regular']);
    expect(show.tickets.constellation).toMatchObject({ label: 'Дети «Созвездия»', labelFR: 'Enfants de Constellation', price: 10, seats: 1 });
    expect(show.tickets.regular).toMatchObject({ label: 'Обычный билет', labelFR: 'Billet standard', price: 15, seats: 1 });
    expect(show.tickets.regular!.hint).toBe('Для взрослых и детей');
    expect(show.tickets.regular!.hintFR).toBe('Pour adultes et enfants');
  });

  it('слова «остальные», отдельных «Взрослый» / «Детский 15 €» нет', () => {
    for (const t of Object.values(show.tickets)) {
      expect(`${t!.label} ${t!.labelFR}`).not.toMatch(/остальн|Взросл|Детский/i);
    }
  });

  it('общие названия тарифов (письмо, PDF, Stripe, админка, сканер) совпадают с каталогом', () => {
    for (const [id, t] of Object.entries(show.tickets)) {
      expect(ticketTypeLabel(id, 'RU')).toBe(t!.label);
      expect(ticketTypeLabel(id, 'FR')).toBe(t!.labelFR);
    }
  });

  it.each([
    [[['constellation', 1]], 10],
    [[['regular', 1]], 15],
    [[['regular', 2]], 30],
    [[['constellation', 2]], 20],
    [[['constellation', 1], ['regular', 1]], 25],
  ] as const)('корзина %j = %i €', (lines, total) => {
    const p = priceBasket(TARIFFS, lines.map(([type, quantity]) => ({ type, quantity })), false);
    expect(p.totalAmount).toBe(total);
    expect(p.discountAmount).toBe(0);
  });

  it('лояльность: −50 % на самый дорогой билет (обычный 15 → −7), ровно одна скидка, сумма > 0', () => {
    const mixed = priceBasket(TARIFFS, [{ type: 'constellation', quantity: 1 }, { type: 'regular', quantity: 1 }], true);
    expect(mixed).toMatchObject({ baseAmount: 25, discountAmount: 7, discountTicketType: 'regular', totalAmount: 18 });
    const many = priceBasket(TARIFFS, [{ type: 'regular', quantity: 3 }], true);
    expect(many).toMatchObject({ baseAmount: 45, discountAmount: 7, totalAmount: 38 });
    const one = priceBasket(TARIFFS, [{ type: 'constellation', quantity: 1 }], true);
    expect(one).toMatchObject({ discountAmount: 5, totalAmount: 5 });
  });

  it('цены других спектаклей не изменились', () => {
    for (const id of ['enot', 'shapochka', 'korablik']) {
      expect(CATALOG_SHOWS[id]!.tickets).toEqual({
        child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
        adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
        family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
      });
    }
    expect(ticketTypeLabel('standard', 'RU')).toBe('Обычный');
    expect(ticketTypeLabel('standard', 'FR')).toBe('Plein tarif');
    for (const [id, s] of Object.entries(SEASON_CATALOG)) {
      if (id === ID) continue;
      expect(Object.keys(s.tickets), id).not.toContain('constellation');
      expect(Object.keys(s.tickets), id).not.toContain('regular');
    }
  });
});

// ── Сервер ─────────────────────────────────────────────────────────────────

describe('сервер: бронь «Дюймовочки»', () => {
  it('валидация отвергает чужой тариф спектакля', () => {
    expect(() => request([{ ticketType: 'child', quantity: 1 }])).toThrow();
    expect(() => request([{ ticketType: 'standard', quantity: 1 }])).toThrow();
  });

  it('цену считает сервер: 1 «Созвездие» + 1 обычный = 25 €, состав пишется в бронь', async () => {
    const res = await createBooking({
      ...request([{ ticketType: 'constellation', quantity: 1 }, { ticketType: 'regular', quantity: 1 }]),
      // Клиентские суммы игнорируются.
      ...({ totalAmount: 1, price: 1 } as Record<string, unknown>),
    });
    expect(res.totalAmount).toBe(25);
    expect(store.peek('bookings', res.bookingId)).toMatchObject({
      showId: ID, showTitle: '«Дюймовочка»', showDate: '22 Ноя 2026', showTime: '11:00',
      paymentMethod: 'on_site', ticketsCount: 2, seatsCount: 2, totalAmount: 25,
      ticketItems: [
        { type: 'constellation', quantity: 1, unitPrice: 10, seats: 1, subtotal: 10 },
        { type: 'regular',       quantity: 1, unitPrice: 15, seats: 1, subtotal: 15 },
      ],
    });
    expect(stripe.created).toHaveLength(0);
  });

  it('онлайн-оплата: одна сессия Stripe на 30 €, в описании — названия тарифов', async () => {
    const res = await createBooking(request([{ ticketType: 'regular', quantity: 2 }], { paymentMethod: 'online' }));
    expect(res.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(stripe.created).toHaveLength(1);
    const items = stripe.created[0]!.line_items as Array<{ quantity: number; price_data: { unit_amount: number; currency: string; product_data: { name: string; description?: string } } }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1, price_data: { unit_amount: 3000, currency: 'eur' } });
    expect(items[0]!.price_data.product_data.name).toContain('«Дюймовочка»');
    expect(items[0]!.price_data.product_data.name).toContain('22 Ноя 2026 11:00');
    expect(items[0]!.price_data.product_data.description).toContain('Обычный билет · 15€ × 2');
  });

  it('смешанная онлайн-корзина: 2 × 10 € + 1 × 15 € = 3500 центов', async () => {
    await createBooking(request(
      [{ ticketType: 'constellation', quantity: 2 }, { ticketType: 'regular', quantity: 1 }], { paymentMethod: 'online' },
    ));
    const items = stripe.created[0]!.line_items as Array<{ price_data: { unit_amount: number; product_data: { description?: string } } }>;
    expect(items[0]!.price_data.unit_amount).toBe(3500);
    expect(items[0]!.price_data.product_data.description).toContain('Дети «Созвездия» · 10€ × 2; Обычный билет · 15€ × 1');
  });

  it('продаётся в ограниченном режиме; остаток мест — общий зал', async () => {
    expect(SALES_MODE).toBe('limited');
    expect(LIMITED_SALES_ALLOWLIST).toContain(ID);
    expect(isShowBookingEnabled(ID)).toBe(true);
    expect(isShowSalesPaused(ID)).toBe(false);
    const availability = await readShowAvailability();
    expect(availability[ID]).toMatchObject({ capacity: 50, bookingEnabled: true });
  });

  it('после начала спектакля бронь не принимается', async () => {
    vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
    await expect(createBooking(request([{ ticketType: 'regular', quantity: 1 }]))).rejects.toMatchObject({ reason: 'show_started' });
  });
});

describe('письмо и состав брони подписаны тарифами «Дюймовочки»', () => {
  const items = [
    { type: 'constellation', quantity: 1, unitPrice: 10, seats: 1, subtotal: 10 },
    { type: 'regular',       quantity: 1, unitPrice: 15, seats: 1, subtotal: 15 },
  ];

  it('RU / FR состав', () => {
    expect(ticketBreakdownLabel(items, 'RU')).toBe('1 × Дети «Созвездия», 1 × Обычный билет');
    expect(ticketBreakdownLabel(items, 'FR')).toBe('1 × Enfants de Constellation, 1 × Billet standard');
  });

  it('письмо-билет', () => {
    const mail = buildTicketEmail({
      userName: 'Anna', showId: ID, showTitle: '«Дюймовочка»', showDate: '22 Ноя 2026', showTime: '11:00',
      ticketsCount: 2, ticketType: 'constellation', ticketItems: items, totalAmount: 25, ticketCode: 'ABCD-EFGH',
      status: 'confirmed', paymentMethod: 'on_site', paymentStatus: 'unpaid', lang: 'RU',
    }, { kind: 'booking', withQr: true, siteBase: 'https://x.test' });
    expect(mail.text).toContain('1 × Дети «Созвездия», 1 × Обычный билет');
    expect(mail.html).toContain('25&nbsp;€');
  });
});

// ── Сайт ───────────────────────────────────────────────────────────────────

describe('сайт: Афиша, Репертуар, бегущая строка, админка', () => {
  it('Афиша: есть до начала, исчезает в 11:00 по Парижу сама', () => {
    const ids = (iso: string) => afishaShows(ms(iso)).map(s => s.id);
    expect(ids('2026-11-05T10:00:00Z')).toContain(ID);
    expect(ids('2026-11-22T09:59:00Z')).toContain(ID);
    expect(ids('2026-11-22T10:00:00Z')).not.toContain(ID);
    expect(isShowPast(front, ms('2026-11-22T10:00:00Z'))).toBe(true);
  });

  it('Репертуар: остаётся и после показа', () => {
    const item = PUBLISHED_REPERTOIRE.find(r => r.id === ID)!;
    expect(item).toMatchObject({ status: 'active', title: '«Дюймовочка»', titleFR: '«Poucette»', published: true });
  });

  it('бегущая строка: дата из каталога, RU и FR, после показа — нет', () => {
    expect(marqueeShowItems(NOW.getTime(), 'RU')).toContain('22.11 · «Дюймовочка»');
    expect(marqueeShowItems(NOW.getTime(), 'FR')).toContain('22.11 · «Poucette»');
    expect(marqueeShowItems(ms('2026-11-22T10:00:00Z'), 'RU').join()).not.toContain('Дюймовочка');
  });

  it('карточка Афиши: с афишей, без пустого штампа возраста, без «приостановлено»', () => {
    const html = renderToStaticMarkup(createElement(
      LangContext.Provider, { value: { lang: 'RU', t: RU } },
      createElement(AfishaSlider, { onCardClick: () => {} }),
    ));
    const card = html.slice(html.indexOf('aria-label="«Дюймовочка»"'));
    const one  = card.slice(0, card.indexOf('data-show-idx=', 20));
    expect(one).toContain('«Дюймовочка»');
    expect(one).toContain(`background-image:url(${front.image})`);
    expect(one).not.toContain(RU.sales.pausedStatus);
  });

  it('модалка спектакля: заглушка с названием остаётся только для спектакля без афиши', () => {
    const modal = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    expect(modal).toContain('<PosterPlaceholder palette={show.palette} title={title} />');
    expect(modal).toContain('{show.age && <div className={styles.ageStamp}>{show.age}</div>}');
  });

  it('админка: «Дюймовочка» с датой 22.11 11:00, без метки «приостановлено», места из общего зала', () => {
    const stats = summarizeByShow(adminShowList(FRONT_SHOWS, []), []);
    const s = stats.find(x => x.show.id === ID)!;
    expect(s).toBeDefined();
    const html = renderToStaticMarkup(createElement(AdminShowCard, { stats: s, active: false, onToggle: () => {} }));
    expect(html).toContain('«Дюймовочка»');
    expect(html).toContain('22 Ноя 2026 · 11:00');
    expect(html).not.toContain('Продажи приостановлены');
    expect(html).toContain('0 бронирований · 0\u00a0/\u00a050 мест · свободно 50');
  });

  it('i18n: французская подпись цены и названий', () => {
    expect(front.price).toBe('10 € (дети «Созвездия») / 15 € (взрослые и дети)');
    expect(front.priceFR).toBe('10 € (enfants de Constellation) / 15 € (adultes et enfants)');
    expect(FR.showTags['Сказка']).toBeTruthy();
  });
});

// ── Ссылки на бронь с тарифом ──────────────────────────────────────────────

describe('ссылки ?show=duimovochka&tariff=…', () => {
  const loc = (hash: string, search = '') => ({ hash, search } as Location);

  it('две ссылки на один спектакль — по тарифу', () => {
    const base = 'https://tete-a-tete-theatre-git-develop-banderos14s-projects.vercel.app';
    expect(getShowTariffBookingUrl(ID, 'constellation', base)).toBe(`${base}/#/?show=duimovochka&tariff=constellation`);
    expect(getShowTariffBookingUrl(ID, 'regular', `${base}/`)).toBe(`${base}/#/?show=duimovochka&tariff=regular`);
    expect(TARIFF_PARAM).toBe('tariff');
  });

  it('разбирается и в hash, и в обычном query', () => {
    expect(getShowIdFromLocation(loc('#/?show=duimovochka&tariff=regular'))).toBe(ID);
    expect(getTariffFromLocation(loc('#/?show=duimovochka&tariff=regular'))).toBe('regular');
    expect(getTariffFromLocation(loc('#/', '?show=duimovochka&tariff=constellation'))).toBe('constellation');
    expect(getTariffFromLocation(loc('#/?show=duimovochka'))).toBeNull();
  });

  it('открывает форму с одним билетом выбранного тарифа', () => {
    const now = NOW.getTime();
    expect(resolveBookingDeepLink(front, 'constellation', now)).toEqual({ show: front, ticketType: 'constellation' });
    expect(resolveBookingDeepLink(front, 'regular', now)).toEqual({ show: front, ticketType: 'regular' });
    expect(initialBasketLines(front, 'constellation')).toEqual([{ type: 'constellation', quantity: 1 }]);
    expect(initialBasketLines(front, 'regular')).toEqual([{ type: 'regular', quantity: 1 }]);
    // Без тарифа — выбор по умолчанию (basketLinesFor: первый тариф каталога).
    expect(initialBasketLines(front, undefined)).toEqual([]);
  });

  it('чужой тариф, прошедший или закрытый спектакль — обычная карточка, не форма', () => {
    const now = NOW.getTime();
    expect(resolveBookingDeepLink(front, 'child', now)).toBeNull();
    expect(resolveBookingDeepLink(front, '10', now)).toBeNull();
    expect(resolveBookingDeepLink(front, null, now)).toBeNull();
    expect(initialBasketLines(front, 'child')).toEqual([]);
    expect(resolveBookingDeepLink(front, 'regular', ms('2026-11-22T10:00:00Z'))).toBeNull();
    const kovcheg = FRONT_SHOWS.find(s => s.id === 'kovcheg')!;
    expect(resolveBookingDeepLink(kovcheg, 'standard', now)).toBeNull(); // limited: закрыт
  });

  it('из ссылки берётся только тариф: цену и сумму URL задать не может', () => {
    const src = projectSource('src/utils/bookingDeepLink.ts');
    expect(src).not.toMatch(/getQueryParam\('(price|amount|total|quantity|qty)'/);
    expect(projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx'))
      .toContain('if (linkedBooking) onBook(linkedBooking.show, linkedBooking.ticketType);');
    // Корзина задаётся при открытии формы для спектакля и не сбрасывается входом.
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain('setBasketState({ showId: show.id, lines: initialBasketLines(show, initialTicketType) });');
  });
});
