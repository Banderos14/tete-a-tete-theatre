// Новогодние постановки: «Фунтик: Новогодний переполох» (6 сеансов) и
// «Новый год в стране сладостей» (3 сеанса), семейные пакеты с подарками.
//
// Контракт multi-performance: каждый сеанс — ОТДЕЛЬНАЯ запись каталога
// (performanceId = showId), у неё своя вместимость 50, свой остаток мест,
// своя сессия Stripe и свой QR-контекст. productionId лишь собирает сеансы
// в одну карточку Афиши и Репертуара.
//
// Цены пакетов — официальные цены театра за ВЕСЬ пакет; места = взрослые +
// дети; подарок места не занимает. Сервер берёт всё по id тарифа — из запроса
// не читается ни цена, ни места, ни подарки.
//
// Серверный путь проверяется поверх in-memory Firestore и фейкового Stripe —
// как в duimovochka.test.ts и salesMode.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { projectSource } from '../helpers/serverSource.js';
import {
  SEASON_CATALOG, SHOWS as CATALOG_SHOWS, THEATRE_CAPACITY, FUNTIK_TICKETS, SLADOSTI_TICKETS,
  showStartUtcMs, productionIdOf, isLoyaltyEligibleShow,
} from '../../shared/catalog/shows';
import { isShowBookingEnabled, LIMITED_SALES_ALLOWLIST, SALES_MODE } from '../../shared/catalog/salesMode';
import { ticketTypeLabel, TARIFF_GROUP_LABELS } from '../../shared/catalog/ticketTypes';
import { priceBasket, catalogTariffs, bookingGiftsCount } from '../../shared/domain/ticketBasket';
import { isBookingForShow } from '../../shared/domain/performance';
import { buildTicketEmail } from '../../shared/email/ticketEmail';
import {
  SHOWS as FRONT_SHOWS, PUBLISHED_REPERTOIRE, afishaShows, upcomingSessions, productionSessions,
  productionRepresentative, seasonStartYear,
} from '../../src/data/shows';
import { marqueeShowItems } from '../../src/pages/HomePage/sections/Marquee/marqueeItems';
import { AfishaSlider } from '../../src/pages/HomePage/sections/Afisha/AfishaSlider';
import { AdminShowCard } from '../../src/pages/AdminPage/AdminShowCard';
import { adminShowList, summarizeByShow } from '../../src/pages/AdminPage/adminStats';
import { checkinShowOptions } from '../../src/pages/TicketCheckPage/checkinShows';
import { sessionDateLabel } from '../../src/pages/HomePage/components/SessionPicker';
import { LangContext } from '../../src/i18n/LangContext';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { resolveBookingDeepLink, getShowTariffBookingUrl } from '../../src/utils/bookingDeepLink';
import { BookingFormStep } from '../../src/components/ui/BookingModal/BookingFormStep';

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

type FakeSession = {
  id: string; object: 'checkout.session'; url: string | null; status: string; payment_status: string;
  amount_total: number; currency: string; client_reference_id: string | null;
  metadata: Record<string, string>; payment_intent: string | null; expires_at: number; livemode: boolean;
};

// Фейковый Stripe: запоминает параметры сессии — по ним проверяется сумма.
class FakeStripe {
  sessions = new Map<string, FakeSession>();
  created: Array<Record<string, unknown>> = [];
  private n = 0;
  checkout = { sessions: {
    create: async (params: Record<string, unknown>) => {
      const id = `cs_test_${++this.n}`;
      const items = params.line_items as Array<{ price_data: { unit_amount: number; currency: string } }>;
      const s: FakeSession = {
        id, object: 'checkout.session', url: `https://checkout.stripe.test/${id}`, status: 'open',
        payment_status: 'unpaid', amount_total: items[0]!.price_data.unit_amount,
        currency: items[0]!.price_data.currency, client_reference_id: params.client_reference_id as string,
        metadata: params.metadata as Record<string, string>, payment_intent: null,
        expires_at: params.expires_at as number, livemode: false,
      };
      this.sessions.set(id, s);
      this.created.push(params);
      return s;
    },
    retrieve: async (id: string) => this.sessions.get(id)!,
    expire:   async (id: string) => { const s = this.sessions.get(id)!; s.status = 'expired'; return s; },
  } };
  pay(id: string) {
    const s = this.sessions.get(id)!;
    s.status = 'complete'; s.payment_status = 'paid'; s.payment_intent = `pi_${id}`; s.url = null;
  }
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
const { checkinTicket }         = await import('../../server/checkin/checkin.service.js');
const { confirmOnlinePayment, expireOnlineBooking } = await import('../../server/payments/onlinePayment.service.js');
const { sessionViewOf }         = await import('../../server/payments/onlinePayment.js');
const { ApiError }              = await import('../../server/shared/errors.js');

const UID = 'user-anna';
const NOW = new Date('2026-11-09T10:00:00Z');
const ms  = (iso: string) => new Date(iso).getTime();

const FUNTIK_SESSIONS = [
  ['funtik-2026-12-12-1800', '12', 'Дек', '2026', '18:00', '2026-12-12T17:00:00Z'],
  ['funtik-2026-12-13-1500', '13', 'Дек', '2026', '15:00', '2026-12-13T14:00:00Z'],
  ['funtik-2026-12-13-1800', '13', 'Дек', '2026', '18:00', '2026-12-13T17:00:00Z'],
  ['funtik-2026-12-19-1800', '19', 'Дек', '2026', '18:00', '2026-12-19T17:00:00Z'],
  ['funtik-2026-12-20-1500', '20', 'Дек', '2026', '15:00', '2026-12-20T14:00:00Z'],
  ['funtik-2026-12-20-1800', '20', 'Дек', '2026', '18:00', '2026-12-20T17:00:00Z'],
] as const;
const SLADOSTI_SESSIONS = [
  ['sladosti-2026-12-13-1100', '13', 'Дек', '2026', '11:00', '2026-12-13T10:00:00Z'],
  ['sladosti-2026-12-20-1100', '20', 'Дек', '2026', '11:00', '2026-12-20T10:00:00Z'],
  // Январь — 2027 год (сезон 2026/2027). В Ницце зимнее время: UTC+1.
  ['sladosti-2027-01-10-1100', '10', 'Янв', '2027', '11:00', '2027-01-10T10:00:00Z'],
] as const;

const F1318 = 'funtik-2026-12-13-1800';
const F1315 = 'funtik-2026-12-13-1500';
const S0110 = 'sladosti-2027-01-10-1100';

type Items = Array<{ ticketType: string; quantity: number }>;
const request = (showId: string, items: Items, body: Record<string, unknown> = {}, uid = UID) => ({
  ...validateCreateBooking({
    showId, items, paymentMethod: 'on_site', comment: '', phone: '+33 6 12 34 56 78', lang: 'RU', ...body,
  }),
  uid,
  idempotencyKeyRaw: null,
});

async function refusal(p: Promise<unknown>): Promise<InstanceType<typeof ApiError>> {
  try { await p; } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('ожидался отказ');
}
const booking = (id: string) => store.peek('bookings', id)! as Record<string, unknown>;

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

// ── А. Каталог ─────────────────────────────────────────────────────────────

describe('каталог: постановки и сеансы', () => {
  it('у каждой постановки одна запись на сеанс, дубликатов постановок нет', () => {
    const byTitle = (re: RegExp) => Object.entries(SEASON_CATALOG).filter(([, s]) => re.test(s.title));
    expect(byTitle(/Фунтик/).map(([id]) => id)).toEqual(FUNTIK_SESSIONS.map(s => s[0]));
    expect(byTitle(/стране сладостей/).map(([id]) => id)).toEqual(SLADOSTI_SESSIONS.map(s => s[0]));
    expect(byTitle(/Дюймовочка/).map(([id]) => id)).toEqual(['duimovochka']);
    // Все сеансы одной постановки — один productionId, одно название.
    for (const [id] of FUNTIK_SESSIONS) {
      expect(productionIdOf(id)).toBe('funtik');
      expect(SEASON_CATALOG[id]!.title).toBe('«Фунтик: Новогодний переполох»');
    }
    for (const [id] of SLADOSTI_SESSIONS) {
      expect(productionIdOf(id)).toBe('sladosti');
      expect(SEASON_CATALOG[id]!.titleFR).toBe('«Le Nouvel An au pays des douceurs»');
    }
    // productionId — не спектакль: забронировать «funtik» нельзя.
    expect(Object.hasOwn(SEASON_CATALOG, 'funtik')).toBe(false);
    expect(Object.hasOwn(SEASON_CATALOG, 'sladosti')).toBe(false);
  });

  it.each([...FUNTIK_SESSIONS, ...SLADOSTI_SESSIONS])('%s: дата, время, год и момент начала по Europe/Paris', (id, day, month, year, time, utc) => {
    const s = SEASON_CATALOG[id]!;
    expect([s.day, s.month, s.year, s.time]).toEqual([day, month, year, time]);
    expect(s.published).toBe(true);
    expect(showStartUtcMs(s)).toBe(ms(utc));
  });

  it('январский сеанс — 2027 год, но сезон 2026 / 2027', () => {
    const jan = FRONT_SHOWS.find(s => s.id === S0110)!;
    expect(jan.year).toBe('2027');
    expect(jan.date).toBe('10.01');
    expect(seasonStartYear(jan)).toBe(2026);
    expect(seasonStartYear(FRONT_SHOWS.find(s => s.id === F1318)!)).toBe(2026);
    expect(sessionDateLabel(jan, 'RU', RU.months)).toBe('вс, 10 Янв 2027 · 11:00');
    expect(sessionDateLabel(jan, 'FR', FR.months)).toBe('dim. 10 Janvier 2027 · 11:00');
  });

  it('вместимость — 50 мест на КАЖДЫЙ сеанс', () => {
    expect(THEATRE_CAPACITY).toBe(50);
    for (const id of [...FUNTIK_SESSIONS, ...SLADOSTI_SESSIONS].map(s => s[0])) {
      expect(FRONT_SHOWS.find(s => s.id === id)!.totalSeats, id).toBe(50);
    }
  });

  it('возраст: «Фунтик» 4+, «Страна сладостей» 1+ (предупреждение про 7 лет — не рейтинг)', () => {
    const f = FRONT_SHOWS.find(s => s.id === F1318)!;
    const sl = FRONT_SHOWS.find(s => s.id === S0110)!;
    expect(f.age).toBe('4+');
    expect(sl.age).toBe('1+');
    for (const s of [f, sl]) {
      expect(s.notice).toBe('Дети до 7 лет без сопровождения взрослых не допускаются.');
      expect(s.noticeFR).toBe('Les enfants de moins de 7 ans ne sont pas admis sans un adulte accompagnateur.');
    }
    // У «Дюймовочки» возраста нет — не выдуман.
    expect(FRONT_SHOWS.find(s => s.id === 'duimovochka')!.age).toBe('');
  });

  it('официальные афиши: у постановки одна, у разных — разные; заглушек нет', () => {
    const posterOf = (pid: string) => new Set(FRONT_SHOWS.filter(s => s.productionId === pid).map(s => s.image));
    expect([...posterOf('funtik')]).toHaveLength(1);
    expect([...posterOf('sladosti')]).toHaveLength(1);
    expect([...posterOf('funtik')][0]).toMatch(/funtik.*\.webp$/);
    expect([...posterOf('sladosti')][0]).toMatch(/sladosti.*\.webp$/);
    expect(FRONT_SHOWS.find(s => s.id === 'duimovochka')!.image).toMatch(/duimovochka.*\.webp$/);
    for (const id of ['funtik', 'sladosti', 'duimovochka']) {
      const rep = PUBLISHED_REPERTOIRE.find(r => r.id === id)!;
      expect(rep.image, id).toBe(FRONT_SHOWS.find(s => s.productionId === id)!.image);
    }
  });

  it('официальные описания RU дословно, FR без кириллицы', () => {
    const f  = FRONT_SHOWS.find(s => s.id === F1318)!;
    const sl = FRONT_SHOWS.find(s => s.id === S0110)!;
    expect(f.desc.startsWith('Фунтик и его друзья приглашают вас в головокружительное приключение!')).toBe(true);
    expect(f.desc.endsWith('Приходите всей семьёй — смеяться, удивляться и болеть за Фунтика!')).toBe(true);
    expect(sl.desc.startsWith('В сладкой сказочной стране все готовятся к Новому году.')).toBe(true);
    expect(sl.desc.endsWith('в которой малыши станут участниками волшебной истории.')).toBe(true);
    for (const s of [f, sl]) {
      expect(s.descFR).not.toMatch(/[А-Яа-яЁё]/);
      expect(s.authorFR).not.toMatch(/[А-Яа-яЁё]/);
      expect(s.titleFR).not.toMatch(/[А-Яа-яЁё]/);
      expect(s.ticketTypes.every(tt => !/[А-Яа-яЁё]/.test(tt.labelFR))).toBe(true);
    }
    expect(f.descFR).toContain('Fountik');
  });

  it('limited: обе постановки в allowlist по productionId; режим не переключён', () => {
    expect(SALES_MODE).toBe('limited');
    expect(LIMITED_SALES_ALLOWLIST).toEqual(expect.arrayContaining(['enot', 'shapochka', 'duimovochka', 'funtik', 'sladosti']));
    for (const [id] of [...FUNTIK_SESSIONS, ...SLADOSTI_SESSIONS]) expect(isShowBookingEnabled(id), id).toBe(true);
    // Ранее закрытые спектакли остаются закрытыми.
    for (const id of ['kovcheg', 'lubov', 'razgovor']) expect(isShowBookingEnabled(id), id).toBe(false);
  });
});

// ── В/Г. Пакеты ─────────────────────────────────────────────────────────────

describe('«Фунтик»: 12 официальных пакетов', () => {
  const EXPECTED: Array<[string, number, number, number, number, 'association' | 'standard']> = [
    // id,                  цена, взрослые, дети, подарки, категория
    ['funtik_assoc_child',  50, 0, 1, 1, 'association'],
    ['funtik_assoc_adult',  35, 1, 0, 0, 'association'],
    ['funtik_assoc_1a1c',   80, 1, 1, 1, 'association'],
    ['funtik_assoc_2a1c',  100, 2, 1, 1, 'association'],
    ['funtik_assoc_1a2c',  120, 1, 2, 2, 'association'],
    ['funtik_assoc_2a2c',  130, 2, 2, 2, 'association'],
    ['funtik_std_child',    60, 0, 1, 1, 'standard'],
    ['funtik_std_adult',    45, 1, 0, 0, 'standard'],
    ['funtik_std_1a1c',    100, 1, 1, 1, 'standard'],
    ['funtik_std_2a1c',    130, 2, 1, 1, 'standard'],
    ['funtik_std_1a2c',    150, 1, 2, 2, 'standard'],
    ['funtik_std_2a2c',    170, 2, 2, 2, 'standard'],
  ];

  it('ровно 12 тарифов: цена за пакет, места = взрослые + дети, подарки', () => {
    expect(Object.keys(FUNTIK_TICKETS)).toEqual(EXPECTED.map(e => e[0]));
    for (const [id, price, adults, children, gifts, group] of EXPECTED) {
      expect(FUNTIK_TICKETS[id as keyof typeof FUNTIK_TICKETS], id).toMatchObject({
        price, adults, children, gifts, group, seats: adults + children,
      });
    }
  });

  it('каждый сеанс продаёт ровно эти 12 пакетов по тем же ценам', () => {
    for (const [id] of FUNTIK_SESSIONS) expect(SEASON_CATALOG[id]!.tickets, id).toEqual(FUNTIK_TICKETS);
  });

  it('цены — официальные, а не формула: «2 взрослых + 2 ребёнка» ассоциации — 130 €, не 170 €', () => {
    const a = FUNTIK_TICKETS;
    expect(a.funtik_assoc_2a2c.price).toBe(130);
    expect(2 * a.funtik_assoc_adult.price + 2 * a.funtik_assoc_child.price).toBe(170);
  });

  it('названия категорий и подписи пакетов RU/FR; без слова «остальные»', () => {
    expect(TARIFF_GROUP_LABELS.association).toMatchObject({ RU: 'Для семей ассоциации', FR: "Pour les familles de l'association" });
    expect(TARIFF_GROUP_LABELS.standard).toMatchObject({ RU: 'Стандартные тарифы', FR: 'Tarifs standard', hintRU: 'Для всех зрителей', hintFR: 'Pour tous les spectateurs' });
    expect(ticketTypeLabel('funtik_assoc_2a1c', 'RU')).toBe('Семьи ассоциации: 2 взрослых + ребёнок, 1 подарок');
    expect(ticketTypeLabel('funtik_std_2a1c', 'FR')).toBe('Tarif standard : 2 adultes + enfant, 1 cadeau');
    const all = JSON.stringify([TARIFF_GROUP_LABELS, Object.keys(FUNTIK_TICKETS).map(id => ticketTypeLabel(id, 'RU'))]);
    expect(all).not.toMatch(/остальн/i);
  });
});

describe('«Страна сладостей»: 4 семейных пакета', () => {
  it('50 / 70 / 85 / 90 €, места 2 / 3 / 3 / 4, подарки 1 / 1 / 2 / 2, без категорий', () => {
    expect(Object.entries(SLADOSTI_TICKETS).map(([id, t]) => [id, t.price, t.seats, t.gifts, t.adults, t.children, t.group]))
      .toEqual([
        ['sladosti_1a1c', 50, 2, 1, 1, 1, undefined],
        ['sladosti_2a1c', 70, 3, 1, 2, 1, undefined],
        ['sladosti_1a2c', 85, 3, 2, 1, 2, undefined],
        ['sladosti_2a2c', 90, 4, 2, 2, 2, undefined],
      ]);
    for (const [id] of SLADOSTI_SESSIONS) expect(SEASON_CATALOG[id]!.tickets, id).toEqual(SLADOSTI_TICKETS);
    expect(ticketTypeLabel('sladosti_1a2c', 'FR')).toBe('Adulte + 2 enfants, 2 cadeaux');
  });

  it('корзина считает места и подарки по пакетам', () => {
    const p = priceBasket(catalogTariffs(SLADOSTI_TICKETS), [
      { type: 'sladosti_2a2c', quantity: 1 }, { type: 'sladosti_1a1c', quantity: 2 },
    ], false);
    expect(p.totalAmount).toBe(90 + 2 * 50);
    expect(p.seatsCount).toBe(4 + 2 * 2);
    expect(p.composition).toEqual({ adults: 4, children: 4, gifts: 4 });
  });
});

// ── Сервер: цена, места, вместимость сеанса ─────────────────────────────────

describe('сервер: бронь пакета', () => {
  it('«2 взрослых + ребёнок» ассоциации на 13.12 18:00 — 100 €, 3 места, 1 подарок; всё считает сервер', async () => {
    const res = await createBooking(request(F1318, [{ ticketType: 'funtik_assoc_2a1c', quantity: 1 }], {
      // Попытка подсунуть цену, места и подарки — игнорируется.
      totalAmount: 1, seatsCount: 1, giftsCount: 9, price: 1,
    }));
    expect(res.totalAmount).toBe(100);
    const b = booking(res.bookingId);
    expect(b).toMatchObject({
      showId: F1318, showDate: '13 Дек 2026', showTime: '18:00', showTitle: '«Фунтик: Новогодний переполох»',
      ticketsCount: 1, seatsCount: 3, totalAmount: 100,
      adultsCount: 2, childrenCount: 1, giftsCount: 1, ticketType: 'funtik_assoc_2a1c',
    });
    expect(b.ticketItems).toEqual([{
      type: 'funtik_assoc_2a1c', quantity: 1, unitPrice: 100, seats: 3, subtotal: 100, adults: 2, children: 1, gifts: 1,
    }]);
    expect((b.showStartAt as { seconds: number }).seconds * 1000).toBe(ms('2026-12-13T17:00:00Z'));
    expect(String(b.priceInfo)).toContain('Семьи ассоциации: 2 взрослых + ребёнок, 1 подарок · 100€ × 1');
  });

  it('пакет «ребёнок с подарком» — одно место; «взрослый без подарка» — одно место, 0 подарков', async () => {
    const r = await createBooking(request(F1315, [
      { ticketType: 'funtik_std_child', quantity: 1 }, { ticketType: 'funtik_std_adult', quantity: 1 },
    ]));
    expect(booking(r.bookingId)).toMatchObject({ seatsCount: 2, totalAmount: 105, giftsCount: 1, adultsCount: 1, childrenCount: 1 });
  });

  it('чужой тариф отклоняется: пакет «Страны сладостей» на сеанс «Фунтика» и наоборот', () => {
    expect(() => validateCreateBooking({
      showId: F1318, items: [{ ticketType: 'sladosti_1a1c', quantity: 1 }], paymentMethod: 'on_site', phone: '+33612345678',
    })).toThrow(/not available/);
    expect(() => validateCreateBooking({
      showId: S0110, items: [{ ticketType: 'funtik_std_1a1c', quantity: 1 }], paymentMethod: 'on_site', phone: '+33612345678',
    })).toThrow(/not available/);
    expect(() => validateCreateBooking({
      showId: 'funtik', items: [{ ticketType: 'funtik_std_1a1c', quantity: 1 }], paymentMethod: 'on_site', phone: '+33612345678',
    })).toThrow(/Invalid showId/);
  });

  it('50 мест на сеанс: 12 × «2+2» (48) + «1+1» (2) — зал полон, 51-й участник — capacity_exceeded', async () => {
    for (let i = 0; i < 12; i++) {
      await createBooking(request(F1318, [{ ticketType: 'funtik_std_2a2c', quantity: 1 }], {}, `u${i}`));
    }
    await createBooking(request(F1318, [{ ticketType: 'funtik_std_1a1c', quantity: 1 }], {}, 'u-last'));
    const err = await refusal(createBooking(request(F1318, [{ ticketType: 'funtik_std_adult', quantity: 1 }], {}, 'u-51')));
    expect(err.status).toBe(409);
    expect(err.reason).toBe('capacity_exceeded');
    const av = await readShowAvailability();
    expect(av[F1318]).toMatchObject({ capacity: 50, sold: 50, remaining: 0 });
    // Соседний сеанс того же дня (15:00) не тронут — вместимость независимая.
    expect(av[F1315]).toMatchObject({ capacity: 50, sold: 0, remaining: 50 });
    const ok = await createBooking(request(F1315, [{ ticketType: 'funtik_std_adult', quantity: 1 }], {}, 'u-51'));
    expect(booking(ok.bookingId).showId).toBe(F1315);
  });

  it('пакеты не продаются сверх остатка: 3 места осталось — пакет на 4 места отклоняется', async () => {
    for (let i = 0; i < 11; i++) {
      await createBooking(request(S0110, [{ ticketType: 'sladosti_2a2c', quantity: 1 }], {}, `s${i}`)); // 44
    }
    await createBooking(request(S0110, [{ ticketType: 'sladosti_2a1c', quantity: 1 }], {}, 's-x')); // 47
    const err = await refusal(createBooking(request(S0110, [{ ticketType: 'sladosti_2a2c', quantity: 1 }], {}, 's-y')));
    expect(err.reason).toBe('capacity_exceeded');
    expect(err.details).toMatchObject({ remaining: 3 });
    // Пакет на 3 места помещается ровно.
    await createBooking(request(S0110, [{ ticketType: 'sladosti_1a2c', quantity: 1 }], {}, 's-y'));
    expect((await readShowAvailability())[S0110]).toMatchObject({ sold: 50, remaining: 0 });
    // Остальные сеансы «Страны сладостей» свободны.
    expect((await readShowAvailability())['sladosti-2026-12-13-1100']).toMatchObject({ sold: 0, remaining: 50 });
  });

  it('прошедший сеанс купить нельзя, даже если следующие ещё впереди', async () => {
    vi.setSystemTime(new Date('2026-12-13T14:30:00Z')); // 15:30 в Ницце — сеанс 15:00 начался
    const err = await refusal(createBooking(request(F1315, [{ ticketType: 'funtik_std_1a1c', quantity: 1 }])));
    expect(err.reason).toBe('show_started');
    const ok = await createBooking(request(F1318, [{ ticketType: 'funtik_std_1a1c', quantity: 1 }]));
    expect(ok.totalAmount).toBe(100);
  });

  it('остаток мест считается по каждому сеансу из 19+ id — запрос пачками, без смешивания', async () => {
    await createBooking(request('funtik-2026-12-20-1800', [{ ticketType: 'funtik_assoc_1a2c', quantity: 2 }]));
    const av = await readShowAvailability();
    expect(Object.keys(av).length).toBeGreaterThanOrEqual(18);
    expect(av['funtik-2026-12-20-1800']).toMatchObject({ sold: 6, remaining: 44 });
    expect(av['funtik-2026-12-20-1500']).toMatchObject({ sold: 0, remaining: 50 });
    expect(projectSource('server/availability/availability.service.ts')).toContain('IN_LIMIT = 30');
  });
});

// ── Д. Платежи ──────────────────────────────────────────────────────────────

describe('онлайн-оплата пакета', () => {
  it('Stripe получает сумму сервера за весь пакет — 170 € = 17000 центов, одна строка, сеанс в названии', async () => {
    const r = await createBooking(request('funtik-2026-12-20-1500', [{ ticketType: 'funtik_std_2a2c', quantity: 1 }], { paymentMethod: 'online' }));
    expect(stripe.created).toHaveLength(1);
    const items = stripe.created[0]!.line_items as Array<{ quantity: number; price_data: { unit_amount: number; product_data: { name: string; description: string } } }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(1);
    expect(items[0]!.price_data.unit_amount).toBe(17000);
    expect(items[0]!.price_data.product_data.name).toBe('«Фунтик: Новогодний переполох» — 20 Дек 2026 15:00');
    expect(items[0]!.price_data.product_data.description).toContain('Стандартный тариф: 2 взрослых + 2 ребёнка, 2 подарка');
    expect(booking(r.bookingId)).toMatchObject({ paymentStatus: 'awaiting_online', totalAmount: 170, seatsCount: 4 });
  });

  it('webhook об оплате идемпотентен: повтор не меняет бронь и не дублирует ничего', async () => {
    const r = await createBooking(request(S0110, [{ ticketType: 'sladosti_2a1c', quantity: 1 }], { paymentMethod: 'online' }));
    const sid = String(booking(r.bookingId).stripeCheckoutSessionId);
    stripe.pay(sid);
    const first  = await confirmOnlinePayment(sessionViewOf(stripe.sessions.get(sid) as never));
    const snap   = JSON.stringify(booking(r.bookingId));
    const second = await confirmOnlinePayment(sessionViewOf(stripe.sessions.get(sid) as never));
    expect(first.outcome).toBe('confirm');
    expect(second.outcome).toBe('duplicate');
    expect(booking(r.bookingId)).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', totalAmount: 70 });
    expect(JSON.stringify(booking(r.bookingId))).toBe(snap);
  });

  it('истёкшая сессия освобождает места именно этого сеанса', async () => {
    const r = await createBooking(request(F1318, [{ ticketType: 'funtik_assoc_2a2c', quantity: 1 }], { paymentMethod: 'online' }));
    expect((await readShowAvailability())[F1318]).toMatchObject({ sold: 4 });
    const sid = String(booking(r.bookingId).stripeCheckoutSessionId);
    stripe.sessions.get(sid)!.status = 'expired';
    await expireOnlineBooking(sessionViewOf(stripe.sessions.get(sid) as never), 'session_expired');
    expect(booking(r.bookingId).paymentStatus).toBe('expired');
    expect((await readShowAvailability())[F1318]).toMatchObject({ sold: 0, remaining: 50 });
  });
});

// ── Лояльность ──────────────────────────────────────────────────────────────

describe('лояльность: на пакетные постановки скидка не действует, бонус сохраняется', () => {
  // Четыре реальных прохода — скидка 50 % заработана.
  function seedVisits() {
    ['romantika', 'shutka', 'korablik', 'razgovor'].forEach((showId, i) => {
      const s = SEASON_CATALOG[showId]!;
      store.seed('bookings', `v${i}`, {
        userId: UID, showId, showDate: `${s.day} ${s.month} ${s.year}`, showTime: s.time,
        status: 'attended', paymentStatus: 'paid', ticketsCount: 1, seatsCount: 1, totalAmount: 20,
      });
    });
  }

  it('сеансы «Фунтика» и «Страны сладостей» помечены loyaltyEligible: false; остальные — нет', () => {
    for (const [id] of [...FUNTIK_SESSIONS, ...SLADOSTI_SESSIONS]) expect(isLoyaltyEligibleShow(SEASON_CATALOG[id]!), id).toBe(false);
    for (const id of ['duimovochka', 'enot', 'shapochka']) expect(isLoyaltyEligibleShow(SEASON_CATALOG[id]!), id).toBe(true);
  });

  it('пакет за 170 € — полная цена, бонус не тратится; следующая бронь «Дюймовочки» получает −50 %', async () => {
    seedVisits();
    const pkg = await createBooking(request('funtik-2026-12-19-1800', [{ ticketType: 'funtik_std_2a2c', quantity: 1 }]));
    const b = booking(pkg.bookingId);
    expect(b.totalAmount).toBe(170);
    expect(b.loyaltyDiscountApplied).toBeUndefined();
    expect(b.loyaltyDiscountAmount).toBeUndefined();

    const duim = await createBooking(request('duimovochka', [{ ticketType: 'regular', quantity: 1 }]));
    expect(booking(duim.bookingId)).toMatchObject({ totalAmount: 8, loyaltyDiscountApplied: true, loyaltyDiscountAmount: 7 });
  });

  it('форма брони применяет то же правило и честно пишет, что бонус сохранится', () => {
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain("const loyaltyEligible  = show?.loyaltyEligible !== false;");
    expect(modal).toContain('const loyaltyAvailable = loyaltyEarned && loyaltyEligible;');
    expect(RU.booking.loyaltyNotEligible).toContain('бонус сохранится');
    expect(FR.booking.loyaltyNotEligible).toContain('conservé');
  });
});

// ── Е. Письмо, PDF, проход ──────────────────────────────────────────────────

describe('письмо и PDF пакета', () => {
  it('письмо: сеанс, дата и время, пакет с категорией, места, подарки, сумма — RU и FR', async () => {
    const r = await createBooking(request(F1318, [{ ticketType: 'funtik_assoc_2a1c', quantity: 1 }]));
    const b = booking(r.bookingId) as never as Parameters<typeof buildTicketEmail>[0];
    const ru = buildTicketEmail({ ...b, lang: 'RU' }, { kind: 'booking', withQr: true }).text;
    expect(ru).toContain('Спектакль: «Фунтик: Новогодний переполох»');
    expect(ru).toContain('Дата: 13 Дек 2026 · 18:00');
    expect(ru).toContain('Мест: 3');
    expect(ru).toContain('Подарков: 1');
    expect(ru).toContain('1 × Семьи ассоциации: 2 взрослых + ребёнок, 1 подарок');
    expect(ru).toContain('100 €');
    const fr = buildTicketEmail({ ...b, lang: 'FR' }, { kind: 'booking', withQr: true }).text;
    expect(fr).toContain('«Fountik : Panique au Nouvel An»');
    expect(fr).toMatch(/13 décembre 2026 · 18:00/i);
    expect(fr).toContain('Cadeaux: 1');
    expect(fr).toContain("1 × Familles de l'association : 2 adultes + enfant, 1 cadeau");
  });

  it('PDF печатает пакет даже одной строкой и число подарков', () => {
    const pdf = projectSource('src/services/ticketPdfService.ts');
    expect(pdf).toContain('if (ticketLines.length > 1 || isPackage) {');
    expect(pdf).toContain("if (gifts > 0) rows.push([L.gifts, String(gifts)]);");
    expect(bookingGiftsCount({ ticketItems: [{ type: 'sladosti_1a2c', quantity: 2, gifts: 2 }] })).toBe(4);
    expect(bookingGiftsCount({ giftsCount: 3 })).toBe(3);
    expect(bookingGiftsCount({ ticketItems: [{ type: 'standard', quantity: 2 }] })).toBe(0);
  });
});

describe('проход: билет только на свой сеанс', () => {
  async function paidBooking(showId: string, uid = UID) {
    const r = await createBooking(request(showId, [{ ticketType: 'funtik_std_1a1c', quantity: 1 }], {}, uid));
    store.seed('bookings', r.bookingId, { ...booking(r.bookingId), paymentStatus: 'paid', status: 'confirmed' });
    return r.ticketCode;
  }

  it('билет 13.12 15:00 на сеансе 18:00 того же дня — wrong_show; на своём — проход; повтор — already_attended', async () => {
    const code = await paidBooking(F1315);
    const wrong = await refusal(checkinTicket({ adminUid: 'a', ticketCode: code, action: 'mark_attended', showId: F1318 }));
    expect(wrong.reason).toBe('wrong_show');
    const inspect = await checkinTicket({ adminUid: 'a', ticketCode: code, action: 'inspect', showId: F1318 });
    expect(inspect.booking.wrongShow).toBe(true);

    const ok = await checkinTicket({ adminUid: 'a', ticketCode: code, action: 'mark_attended', showId: F1315 });
    expect(ok.booking.status).toBe('attended');
    expect(ok.booking.giftsCount).toBe(1);
    expect(ok.booking.ticketTypeLabel).toBe('Стандартный тариф: Взрослый + ребёнок, 1 подарок');

    const again = await refusal(checkinTicket({ adminUid: 'a', ticketCode: code, action: 'mark_attended', showId: F1315 }));
    expect(again.reason).toBe('already_attended');
  });

  it('отменённая бронь не проходит', async () => {
    const code = await paidBooking(F1318);
    const id = store.listDocs('bookings').find(([, d]) => d.ticketCode === code)![0];
    store.seed('bookings', id, { ...booking(id), status: 'cancelled' });
    const err = await refusal(checkinTicket({ adminUid: 'a', ticketCode: code, action: 'mark_attended', showId: F1318 }));
    expect(err.reason).toBe('cancelled');
  });

  it('identity сеанса — его id: другой сеанс «Фунтика» в тот же день — чужой', () => {
    const b = { showId: F1315, showDate: '13 Дек 2026', showTime: '15:00' };
    expect(isBookingForShow(b, F1315)).toBe(true);
    expect(isBookingForShow(b, F1318)).toBe(false);
  });

  it('сканер предлагает каждый сеанс отдельно — с датой и временем', () => {
    const labels = checkinShowOptions().filter(o => productionIdOf(o.id) === 'funtik').map(o => o.label);
    expect(labels).toEqual([
      '12 Дек 2026 · 18:00 — Фунтик: Новогодний переполох',
      '13 Дек 2026 · 15:00 — Фунтик: Новогодний переполох',
      '13 Дек 2026 · 18:00 — Фунтик: Новогодний переполох',
      '19 Дек 2026 · 18:00 — Фунтик: Новогодний переполох',
      '20 Дек 2026 · 15:00 — Фунтик: Новогодний переполох',
      '20 Дек 2026 · 18:00 — Фунтик: Новогодний переполох',
    ]);
  });
});

// ── Сайт: Афиша, Репертуар, бегущая строка, админка, ссылки ─────────────────

describe('сайт: одна карточка на постановку, сеансы — в модалке', () => {
  it('Афиша: по одной карточке «Фунтика» и «Страны сладостей» — с ближайшим сеансом', () => {
    const now = ms('2026-11-09T10:00:00Z');
    const cards = afishaShows(now).filter(s => ['funtik', 'sladosti'].includes(s.productionId)).map(s => s.id);
    expect(cards).toEqual(['funtik-2026-12-12-1800', 'sladosti-2026-12-13-1100']);
    // После 13.12 15:00 ближайший сеанс «Фунтика» — 13.12 18:00.
    expect(afishaShows(ms('2026-12-13T14:30:00Z')).find(s => s.productionId === 'funtik')!.id).toBe(F1318);
  });

  it('сеансы для выбора — только предстоящие, по времени', () => {
    expect(upcomingSessions('funtik', NOW.getTime()).map(s => s.id)).toEqual(FUNTIK_SESSIONS.map(s => s[0]));
    expect(upcomingSessions('funtik', ms('2026-12-19T18:00:00Z')).map(s => s.id))
      .toEqual(['funtik-2026-12-20-1500', 'funtik-2026-12-20-1800']);
    expect(upcomingSessions('sladosti', ms('2026-12-21T00:00:00Z')).map(s => s.id)).toEqual([S0110]);
    // После всех сеансов — пусто, а представитель для Репертуара — последний сеанс.
    expect(upcomingSessions('funtik', ms('2026-12-21T00:00:00Z'))).toEqual([]);
    expect(productionRepresentative('funtik', ms('2026-12-21T00:00:00Z'))!.id).toBe('funtik-2026-12-20-1800');
    expect(productionSessions('sladosti')).toHaveLength(3);
  });

  it('карточка Афиши «Фунтика»: афиша, 4+ и «+ ещё 5 сеансов»; FR тоже', () => {
    const render = (lang: 'RU' | 'FR') => renderToStaticMarkup(createElement(
      LangContext.Provider, { value: { lang, t: lang === 'FR' ? FR : RU } },
      createElement(AfishaSlider, { onCardClick: () => {} }),
    ));
    const ru = render('RU');
    expect(ru).toContain(RU.afisha.moreSessions(5));
    expect(RU.afisha.moreSessions(5)).toBe('+ ещё 5 сеансов');
    expect(RU.afisha.moreSessions(2)).toBe('+ ещё 2 сеанса');
    expect(ru).toContain(RU.afisha.moreSessions(2)); // «Страна сладостей»: 3 сеанса
    expect(render('FR')).toContain('+ 5 autres séances');
    // Одна карточка на постановку в наборе (набор повторяется для бесконечной ленты).
    const titles = ru.split('«Фунтик: Новогодний переполох»').length - 1;
    const kovcheg = ru.split('«У ковчега в восемь»').length - 1;
    expect(titles).toBe(kovcheg); // столько же раз, сколько любой спектакль с одним показом
  });

  it('Репертуар: одна карточка на постановку, без дубликатов', () => {
    const ids = PUBLISHED_REPERTOIRE.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => id === 'funtik' || id === 'sladosti')).toEqual(['funtik', 'sladosti']);
    const f = PUBLISHED_REPERTOIRE.find(r => r.id === 'funtik')!;
    expect([f.title, f.titleFR, f.published, f.age]).toEqual(['«Фунтик: Новогодний переполох»', '«Fountik : Panique au Nouvel An»', true, '4+']);
  });

  it('бегущая строка: постановка один раз, ближайшая дата', () => {
    const items = marqueeShowItems(NOW.getTime(), 'RU');
    expect(items.filter(i => i.includes('Фунтик'))).toEqual(['12.12 · «Фунтик: Новогодний переполох»']);
  });

  it('админка: у каждого сеанса своя карточка — дата, время и свои 50 мест', () => {
    const stats = summarizeByShow(adminShowList(FRONT_SHOWS, []), []);
    for (const [id, day, month, year, time] of FUNTIK_SESSIONS) {
      const s = stats.find(x => x.show.id === id)!;
      const html = renderToStaticMarkup(createElement(AdminShowCard, { stats: s, active: false, onToggle: () => {} }));
      expect(html, id).toContain(`${day} ${month} ${year} · ${time}`);
      expect(html, id).toContain('0 / 50 мест · свободно 50');
      expect(html, id).not.toContain('Продажи приостановлены');
    }
  });

  it('ссылка на бронь сеанса с пакетом; чужой пакет и productionId не открывают форму', () => {
    const show = FRONT_SHOWS.find(s => s.id === F1318)!;
    expect(resolveBookingDeepLink(show, 'funtik_assoc_2a1c', NOW.getTime())).toMatchObject({ ticketType: 'funtik_assoc_2a1c' });
    expect(resolveBookingDeepLink(show, 'sladosti_1a1c', NOW.getTime())).toBeNull();
    expect(resolveBookingDeepLink(show, 'funtik_assoc_2a1c', ms('2026-12-14T00:00:00Z'))).toBeNull();
    expect(getShowTariffBookingUrl(F1318, 'funtik_assoc_2a1c', 'https://www.theatre-teteatete.fr'))
      .toBe('https://www.theatre-teteatete.fr/#/?show=funtik-2026-12-13-1800&tariff=funtik_assoc_2a1c');
    // Репертуар разбирает и сеанс, и постановку.
    expect(projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx')).toContain('productionIdOf(rawSlug)');
  });

  it('у ShowModal выбор сеанса — только предстоящие сеансы, бронь — на выбранный', () => {
    const modal = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    expect(modal).toContain('upcomingSessions(show.productionId, mountedAtMs)');
    expect(modal).toContain('onBook(session)');
    expect(modal).toContain('fetchAllAvailability()');
  });
});

describe('форма брони пакетов', () => {
  const renderForm = (showId: string, lang: 'RU' | 'FR', extra: Record<string, unknown> = {}) => {
    const show = FRONT_SHOWS.find(s => s.id === showId)!;
    return renderToStaticMarkup(createElement(BookingFormStep, {
      show, lang, t: (lang === 'FR' ? FR : RU) as never,
      quantities: { [(show.ticketTypes[3] ?? show.ticketTypes[0])!.id]: 1 }, ticketsCount: 1, canAdd: () => true, canRemove: () => true,
      soldOut: false, paymentMethods: ['on_site'], payment: 'on_site', phone: '', comment: '',
      submitLoading: false, submitError: '', baseAmount: 100, totalAmount: 100, discountAmount: 0,
      loyaltyAvailable: false, seatsLeft: 50, seatsCount: 3, giftsCount: 1,
      onQuantityChange: () => {}, onPaymentChange: () => {}, onPhoneChange: () => {}, onPhoneBlur: () => {},
      onCommentChange: () => {}, onSubmit: () => {}, ...extra,
    }));
  };

  it('«Фунтик»: две категории, состав пакета, итог в местах и подарках, предупреждение; без мусора в разметке', () => {
    const html = renderForm(F1318, 'RU', { loyaltyNotEligible: true });
    expect(html).toContain('Для семей ассоциации');
    expect(html).toContain('Стандартные тарифы');
    expect(html).toContain('Для всех зрителей');
    expect(html.indexOf('Для семей ассоциации')).toBeLessThan(html.indexOf('Стандартные тарифы'));
    expect(html).toContain('3 места · 1 подарок');
    expect(html).toContain('1 место · без подарка');
    expect(html).toContain('Цена указана за весь пакет');
    expect(html).toContain('1 пакет');
    expect(html).toContain('Дети до 7 лет без сопровождения взрослых не допускаются.');
    expect(html).toContain(RU.booking.loyaltyNotEligible);
    expect(html).toContain('13 Дек 2026 · 18:00');
    // Комментарий в JSX не должен превращаться в текст страницы.
    expect(html).not.toMatch(/>\s*\/\//);
    expect(html).not.toContain('Строка тарифа');
  });

  it('«Страна сладостей» FR: без категорий, без кириллицы, сезон 2026 / 2027 у январского сеанса', () => {
    const html = renderForm(S0110, 'FR');
    expect(html).not.toContain("Pour les familles de l'association");
    expect(html).toContain('3 places · 1 cadeau');
    expect(html).toContain('Prix pour l’ensemble du forfait');
    expect(html).toContain('SAISON 2026 / 2027');
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('«Дюймовочка»: прежняя форма — без пакетных подписей', () => {
    const html = renderForm('duimovochka', 'RU', { quantities: { regular: 1 }, giftsCount: null, seatsCount: 1 });
    expect(html).toContain('Для взрослых и детей');
    expect(html).not.toContain('Цена указана за весь пакет');
    expect(html).not.toContain('подар');
    expect(html).toContain('1 билет');
  });
});

describe('Дюймовочка не изменилась', () => {
  it('10 € + 15 € = 25 €, лояльность действует, ссылки по тарифу прежние', () => {
    const p = priceBasket(catalogTariffs(CATALOG_SHOWS.duimovochka!.tickets), [
      { type: 'constellation', quantity: 1 }, { type: 'regular', quantity: 1 },
    ], false);
    expect(p.totalAmount).toBe(25);
    expect(p.composition).toBeNull();
    expect(getShowTariffBookingUrl('duimovochka', 'constellation', 'https://www.theatre-teteatete.fr'))
      .toBe('https://www.theatre-teteatete.fr/#/?show=duimovochka&tariff=constellation');
    expect(productionIdOf('duimovochka')).toBe('duimovochka');
  });
});
