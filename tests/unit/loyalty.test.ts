// Лояльность: посетите 4 спектакля — 5-й билет со скидкой 50 %.
//
// Правило проверяется поведением: сначала чистая формула, затем настоящая
// транзакция создания брони поверх in-memory Firestore — в том числе
// параллельные брони из двух вкладок.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { loyaltySummary, loyaltyDiscountForTicket, LOYALTY_VISITS_PER_REWARD, type LoyaltyBooking } from '../../shared/domain/loyalty.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import { SHOWS } from '../../shared/catalog/shows.js';

let store = new MemoryFirestore();
vi.mock('firebase-admin/firestore', () => {
  class FakeTimestamp {
    constructor(readonly seconds: number) {}
    toMillis() { return this.seconds * 1000; }
  }
  return {
    FieldValue: { serverTimestamp: () => '<ts>' },
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

const { createBooking } = await import('../../server/booking/booking.service.js');
const { validateCreateBooking } = await import('../../server/booking/booking.validation.js');

const UID = 'user-anna';
const PRICE = SHOWS.shutka!.tickets.standard!.price; // цена одного обычного билета из каталога
// Прошедшие вечера — разные сеансы (разные дни) спектаклей.
const DAYS = ['01 Мар 2026', '02 Мар 2026', '03 Мар 2026', '04 Мар 2026', '05 Мар 2026', '06 Мар 2026'];
const at = (day: string) => parseShowStartUtcMs(day, '20:00');

const visit = (i: number, patch: Partial<LoyaltyBooking> = {}): LoyaltyBooking =>
  ({ status: 'attended', paymentStatus: 'paid', showId: `show-${i}`, startMs: at(DAYS[i]!), ...patch });

describe('формула: 4 посещения → 5-й билет −50 %', () => {
  it('порог — 4 посещения', () => {
    expect(LOYALTY_VISITS_PER_REWARD).toBe(4);
  });

  it.each([
    [0, 4], [1, 3], [2, 2], [3, 1],
  ])('%i посещ. — скидки нет, осталось %i', (n, remaining) => {
    const s = loyaltySummary(Array.from({ length: n }, (_, i) => visit(i)));
    expect(s).toMatchObject({ available: false, progress: n, remaining });
  });

  it('4 разных посещённых спектакля — скидка доступна', () => {
    const s = loyaltySummary([0, 1, 2, 3].map(i => visit(i)));
    expect(s).toMatchObject({ visits: 4, available: true, progress: 4, remaining: 0 });
  });

  it('оплачено, но не пришёл — не посещение', () => {
    const list = [0, 1, 2].map(i => visit(i));
    list.push(visit(3, { status: 'confirmed', paymentStatus: 'paid' }));
    expect(loyaltySummary(list)).toMatchObject({ visits: 3, available: false });
  });

  it('отменённая и протухшая брони — не посещения', () => {
    const list = [0, 1, 2].map(i => visit(i));
    list.push(visit(3, { status: 'cancelled' }), visit(4, { status: 'cancelled', paymentStatus: 'expired' }));
    expect(loyaltySummary(list)).toMatchObject({ visits: 3, available: false });
  });

  it('две брони (или несколько мест) на один спектакль — одно посещение', () => {
    const list = [0, 1, 2].map(i => visit(i));
    list.push(visit(2)); // вторая бронь того же зрителя на тот же вечер
    expect(loyaltySummary(list)).toMatchObject({ visits: 3, available: false });
  });

  it('скидка занята действующей бронью; после неё — новый цикл 0 из 4', () => {
    const list = [0, 1, 2, 3].map(i => visit(i));
    list.push({ status: 'pending', paymentStatus: 'not_paid', showId: 'next', startMs: null, loyaltyDiscountApplied: true });
    expect(loyaltySummary(list)).toMatchObject({ available: false, used: 1, progress: 0, remaining: 4 });
  });

  it('после использования следующий цикл снова считается до 4', () => {
    const list = [0, 1, 2, 3, 4, 5].map(i => visit(i)); // 6 посещений
    list.push({ ...visit(0), showId: 'used', status: 'attended', loyaltyDiscountApplied: true }); // 7-е, со скидкой
    // 7 посещений − 4 за использованную скидку = 3 из 4.
    expect(loyaltySummary(list)).toMatchObject({ visits: 7, available: false, progress: 3, remaining: 1 });
  });

  it('отмена или протухание брони со скидкой возвращает скидку', () => {
    const list = [0, 1, 2, 3].map(i => visit(i));
    list.push({ status: 'cancelled', paymentStatus: 'expired', showId: 'next', startMs: null, loyaltyDiscountApplied: true });
    expect(loyaltySummary(list).available).toBe(true);
  });

  it('8 посещений и одна использованная скидка — доступна вторая', () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ ...visit(0), showId: `s-${i}` }));
    list.push({ ...visit(0), showId: 'used', status: 'attended', loyaltyDiscountApplied: true });
    expect(loyaltySummary(list)).toMatchObject({ visits: 8, available: true });
  });

  it('скидка — 50 % цены одного билета, с округлением вниз', () => {
    expect(loyaltyDiscountForTicket(20)).toBe(10);
    expect(loyaltyDiscountForTicket(15)).toBe(7);
  });
});

describe('тексты правила берут число из порога', () => {
  it('RU и FR: «4 спектакля — 5-й билет»', async () => {
    const { RU, FR } = await import('../../src/i18n');
    expect(RU.profile.loyaltyRule(LOYALTY_VISITS_PER_REWARD)).toBe('Посетите 4 спектакля — 5-й билет со скидкой 50%.');
    expect(FR.profile.loyaltyRule(LOYALTY_VISITS_PER_REWARD)).toBe('Assistez à 4 spectacles — le 5e billet à −50 %.');
    expect(RU.profile.loyaltyOf(2, LOYALTY_VISITS_PER_REWARD)).toBe('2 из 4');
    expect(RU.profile.bonusProgress(2)).toBe('До скидки 50% осталось 2 посещения.');
  });
});

describe('цена считается сервером в транзакции брони', () => {
  beforeEach(() => {
    store = new MemoryFirestore();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T10:00:00Z'));
    // Четыре посещённых спектакля зрителя — скидка доступна.
    for (let i = 0; i < 4; i++) {
      store.seed('bookings', `past-${i}`, {
        userId: UID, showId: `show-${i}`, showDate: DAYS[i], showTime: '20:00',
        status: 'attended', paymentStatus: 'paid', ticketsCount: 1, totalAmount: 20,
      });
    }
  });
  afterEach(() => vi.useRealTimers());

  const request = (body: Record<string, unknown> = {}) => ({
    ...validateCreateBooking({
      showId: 'shutka', ticketType: 'standard', ticketsCount: 2, paymentMethod: 'on_site',
      comment: '', phone: '+33 6 12 34 56 78', lang: 'RU', ...body,
    }),
    uid: UID,
    idempotencyKeyRaw: null,
  });

  it('с 3 посещениями сервер скидку не даёт — нужно 4', async () => {
    store.writeDoc('bookings', 'past-3', { status: 'confirmed' }, 'merge'); // 4-й не пришёл
    const res = await createBooking(request());
    expect(res.loyaltyDiscountApplied).toBeUndefined();
    expect(res.totalAmount).toBe(2 * PRICE);
  });

  it('скидка 50 % — только на один билет брони из двух', async () => {
    const res = await createBooking(request());
    // 2 билета по PRICE, скидка — половина цены ОДНОГО билета.
    const half = Math.floor(PRICE / 2);
    expect(res).toMatchObject({
      totalAmount: 2 * PRICE - half, originalAmount: 2 * PRICE, loyaltyDiscountAmount: half, loyaltyDiscountApplied: true,
    });
  });

  it('клиентские discount / totalAmount / loyaltyCount игнорируются', async () => {
    const body = { totalAmount: 1, discount: 50, loyaltyCount: 99, loyaltyDiscountApplied: true };
    // Без посещений: скидки нет, что бы ни прислал клиент.
    store = new MemoryFirestore();
    const res = await createBooking(request(body));
    expect(res.totalAmount).toBe(2 * PRICE);
    expect(res.loyaltyDiscountApplied).toBeUndefined();
  });

  it('скидку нельзя использовать дважды — ни подряд, ни из двух вкладок одновременно', async () => {
    const [a, b] = await Promise.all([createBooking(request()), createBooking(request())]);
    const discounted = [a, b].filter(r => r.loyaltyDiscountApplied);
    expect(discounted).toHaveLength(1);
    const third = await createBooking(request());
    expect(third.loyaltyDiscountApplied).toBeUndefined();
    expect(third.totalAmount).toBe(2 * PRICE);
  });
});
