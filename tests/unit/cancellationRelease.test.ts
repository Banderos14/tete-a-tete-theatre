// Отмена возвращает места — и в зале, и в сводке админки.
//
// Инцидент: у «И в шутку, и всерьёз» была одна бронь на 3 билета, её отменили,
// в таблице стоял статус «Отменено», а карточка спектакля в админке продолжала
// показывать «1 бронирование · 3 билета». Сервер при этом считал правильно:
// /api/show-availability отдавал 50 из 50. Ошибка была в сводке админки,
// которая суммировала ВСЕ брони, включая отменённые.
//
// Здесь проверяется поведение, а не текст исходников: сервисы работают
// с in-memory моделью Firestore (tests/helpers/memoryFirestore.ts).
//
// Счётчика, который уменьшался бы при отмене, в системе НЕТ: showCounters —
// только точка конфликта транзакций, а занятые места каждый раз
// пересчитываются запросом по броням через occupiesCapacity. Поэтому отрицательный
// остаток или «двойное освобождение» невозможны по построению — тесты ниже
// это и закрепляют.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { projectSource } from '../helpers/serverSource.js';
import type { Booking } from '../../src/types/booking';
import { SHOWS as FRONT_SHOWS } from '../../src/data/shows';

const SERVER_TS = '<server-timestamp>';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

let store = new MemoryFirestore();

vi.mock('../../server/booking/booking.repository.js', () => ({
  db:            () => store,
  bookingsRef:   () => store.collection('bookings'),
  BOOKINGS:      'bookings',
  SHOW_COUNTERS: 'showCounters',
}));

const { cancelBookingByUser }    = await import('../../server/booking/cancellation.service.js');
const { cancelBookingByAdmin }   = await import('../../server/booking/admin.service.js');
const { expireOverdueTransfers } = await import('../../server/expiration/expiration.service.js');
const { readShowAvailability }   = await import('../../server/availability/availability.service.js');
const { occupiesCapacity, countActiveBookings, sumOccupiedTickets } =
  await import('../../shared/domain/bookingRules.js');
const { summarizeBookings, summarizeByShow } = await import('../../src/pages/AdminPage/adminStats');

const SHOW  = 'shutka';          // 2 Окт 2026, 20:00 — после «сейчас» в тестах
const USER  = 'user-1';
const NOW   = new Date('2026-09-13T10:00:00Z');
const HOUR  = 60 * 60 * 1000;

function booking(id: string, patch: Record<string, unknown> = {}) {
  store.seed('bookings', id, {
    showId:        SHOW,
    userId:        USER,
    showDate:      '02 Окт 2026',
    showTime:      '20:00',
    ticketsCount:  3,
    seatsCount:    3,
    totalAmount:   90,
    status:        'pending',
    paymentStatus: 'not_paid',
    paymentMethod: 'on_site',
    ...patch,
  });
}

async function remaining(showId = SHOW) {
  return (await readShowAvailability())[showId]!;
}

/** Отмена администратором — серверное действие cancel из /api/admin-booking. */
async function adminCancel(id: string) {
  await cancelBookingByAdmin('admin-1', id);
}

function userCancel(id: string, uid = USER) {
  return cancelBookingByUser({ uid, bookingId: id, reason: 'plans', comment: '' });
}

/** Документы броней в том виде, в каком их получает админка. */
function adminList(): Booking[] {
  return store.listDocs('bookings').map(([id, d]) => ({ id, ...d }) as unknown as Booking);
}

beforeEach(() => {
  store = new MemoryFirestore();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Определение активной брони ─────────────────────────────────────────────

describe('активная бронь — одно определение для сервера и админки', () => {
  const snap = (status: string, paymentStatus: string, ticketsCount = 3) =>
    ({ status, paymentStatus, ticketsCount });

  it('pending и confirmed учитываются: и в бронях, и в билетах', () => {
    const list = [snap('pending', 'not_paid'), snap('pending', 'awaiting_transfer', 2), snap('confirmed', 'paid', 1)];
    expect(countActiveBookings(list)).toBe(3);
    expect(sumOccupiedTickets(list)).toBe(6);
  });

  it('cancelled исключается', () => {
    expect(occupiesCapacity(snap('cancelled', 'not_paid'))).toBe(false);
    expect(countActiveBookings([snap('cancelled', 'not_paid')])).toBe(0);
  });

  it('expired исключается — даже если статус брони не успели сменить', () => {
    expect(countActiveBookings([snap('cancelled', 'expired'), snap('pending', 'expired')])).toBe(0);
  });

  it('билеты отменённой брони не входят в занятые места', () => {
    expect(sumOccupiedTickets([snap('cancelled', 'not_paid', 3), snap('confirmed', 'paid', 2)])).toBe(2);
  });

  it('сводка админки считает через те же правила, что и сервер', () => {
    const src = projectSource('src/pages/AdminPage/adminStats.ts');
    expect(src).toContain("from '../../../shared/domain/bookingRules'");
    expect(src).toContain('countActiveBookings');
    expect(src).toContain('sumOccupiedTickets');
    expect(projectSource('server/availability/availability.service.ts')).toContain('sumOccupiedTickets');
    expect(projectSource('server/booking/booking.repository.ts')).toContain('sumOccupiedTickets');
  });
});

// ── Сводка админки ────────────────────────────────────────────────────────

describe('сводка админки после отмены', () => {
  it('инцидент shutka: отменённая бронь на 3 билета → 0 броней, 0 билетов', () => {
    booking('b1', { status: 'cancelled', cancelledBy: 'user' });
    const shutka = summarizeByShow(FRONT_SHOWS, adminList()).find(s => s.show.id === SHOW)!;
    expect(shutka).toMatchObject({ bookings: 0, tickets: 0, revenue: 0 });
  });

  it('пересчитывается из текущего списка: 1 бронь / 3 билета → 0 / 0 без перезагрузки', async () => {
    booking('b1');
    const before = adminList();
    expect(summarizeBookings(before)).toMatchObject({ bookings: 1, tickets: 3 });

    // Так useAdminData обновляет состояние после успешной отмены.
    const after = before.map(b => b.id === 'b1' ? { ...b, status: 'cancelled' as const } : b);
    expect(summarizeBookings(after)).toMatchObject({ bookings: 0, tickets: 0 });

    // И после протухания перевода (колбэк expireOverdueBookings).
    const expired = before.map(b => b.id === 'b1'
      ? { ...b, paymentStatus: 'expired' as const, status: 'cancelled' as const } : b);
    expect(summarizeBookings(expired)).toMatchObject({ bookings: 0, tickets: 0 });
  });

  it('другие брони спектакля остаются в сводке', () => {
    booking('b1', { status: 'cancelled' });
    booking('b2', { ticketsCount: 2, seatsCount: 2, status: 'confirmed', paymentStatus: 'paid', totalAmount: 60 });
    expect(summarizeBookings(adminList())).toEqual({ bookings: 1, tickets: 2, revenue: 60 });
  });

  it('касса — фактически полученные деньги: оплаченная и потом отменённая бронь в ней остаётся', () => {
    booking('b1', { status: 'cancelled', paymentStatus: 'paid', totalAmount: 90 });
    booking('b2', { status: 'pending', paymentStatus: 'not_paid', totalAmount: 30 });
    expect(summarizeBookings(adminList())).toEqual({ bookings: 1, tickets: 3, revenue: 90 });
  });
});

// ── Все пути отмены на сервере ────────────────────────────────────────────

describe('отмена зрителем — POST /api/cancel-booking', () => {
  it('бронь на 3 билета: 47 → 50', async () => {
    booking('b1');
    expect(await remaining()).toEqual({ capacity: 50, sold: 3, remaining: 47 });

    await userCancel('b1');

    expect(store.peek('bookings', 'b1')).toMatchObject({ status: 'cancelled', cancelledBy: 'user' });
    expect(await remaining()).toEqual({ capacity: 50, sold: 0, remaining: 50 });
    expect(countActiveBookings(adminList())).toBe(0);
  });

  it('повторная отмена отклоняется и второй раз места не освобождает', async () => {
    booking('b1');
    booking('b2', { ticketsCount: 1, seatsCount: 1 });
    await userCancel('b1');

    await expect(userCancel('b1')).rejects.toMatchObject({ status: 409, reason: 'already_cancelled' });
    expect(await remaining()).toEqual({ capacity: 50, sold: 1, remaining: 49 });
  });

  it('две параллельные отмены: одна проходит, места освобождаются один раз', async () => {
    booking('b1');
    booking('b2', { ticketsCount: 4, seatsCount: 4 });

    const results = await Promise.allSettled([userCancel('b1'), userCancel('b1')]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await remaining()).toEqual({ capacity: 50, sold: 4, remaining: 46 });
  });

  it('отмена одновременно с запросом остатка: ответ — до или после, но не мусор', async () => {
    booking('b1');

    const [, during] = await Promise.all([userCancel('b1'), remaining()]);

    expect([47, 50]).toContain(during.remaining);
    expect(during.sold + during.remaining).toBe(50);
    expect(await remaining()).toEqual({ capacity: 50, sold: 0, remaining: 50 });
  });

  it('отмена касается showCounters только как точки конфликта — числа там не уменьшаются', async () => {
    booking('b1');
    store.seed('showCounters', SHOW, { lastKnownSoldTickets: 3 });
    await userCancel('b1');
    expect(store.peek('showCounters', SHOW)).toEqual({ lastKnownSoldTickets: 3, updatedAt: SERVER_TS });
  });
});

describe('отмена администратором', () => {
  it('сервер пишет статус и аудит отмены — остаток пересчитывается сам', async () => {
    booking('b1');
    await adminCancel('b1');
    expect(store.peek('bookings', 'b1')).toMatchObject({
      status: 'cancelled', cancelledBy: 'admin', cancelledByUid: 'admin-1',
    });
    expect(await remaining()).toMatchObject({ remaining: 50 });
  });

  it('прошедшего в зал отменить нельзя — даже с устаревшей строки админки', async () => {
    booking('b1', { status: 'attended', paymentStatus: 'paid' });
    await expect(adminCancel('b1')).rejects.toMatchObject({ reason: 'already_attended' });
    expect(store.peek('bookings', 'b1')!.status).toBe('attended');
  });


  it('оплаченная бронь на 3 билета: 47 → 50, сводка 1/3 → 0/0, касса не меняется', async () => {
    booking('b1', { status: 'confirmed', paymentStatus: 'paid' });
    expect(await remaining()).toMatchObject({ remaining: 47 });
    expect(summarizeBookings(adminList())).toEqual({ bookings: 1, tickets: 3, revenue: 90 });

    await adminCancel('b1');

    expect(await remaining()).toEqual({ capacity: 50, sold: 0, remaining: 50 });
    expect(summarizeBookings(adminList())).toEqual({ bookings: 0, tickets: 0, revenue: 90 });
  });

  it('повторная отмена отклоняется и ничего не освобождает второй раз', async () => {
    booking('b1');
    booking('b2', { ticketsCount: 2, seatsCount: 2 });
    await adminCancel('b1');
    await expect(adminCancel('b1')).rejects.toMatchObject({ reason: 'already_cancelled' });
    expect(await remaining()).toEqual({ capacity: 50, sold: 2, remaining: 48 });
  });
});

describe('протухание банковского перевода — cron /api/expire-bookings', () => {
  const overdue = { paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer',
    paymentExpiresAt: { seconds: (NOW.getTime() - HOUR) / 1000 } };

  it('awaiting_transfer → expired + cancelled, места освобождаются', async () => {
    booking('b1', overdue);
    expect(await remaining()).toMatchObject({ remaining: 47 });

    const res = await expireOverdueTransfers();

    expect(res.expired).toBe(1);
    expect(store.peek('bookings', 'b1')).toMatchObject({ status: 'cancelled', paymentStatus: 'expired' });
    expect(await remaining()).toEqual({ capacity: 50, sold: 0, remaining: 50 });
    expect(summarizeBookings(adminList())).toMatchObject({ bookings: 0, tickets: 0 });
  });

  it('повторный запуск cron не освобождает места второй раз', async () => {
    booking('b1', overdue);
    booking('b2', { ticketsCount: 5, seatsCount: 5 });

    await expireOverdueTransfers();
    const second = await expireOverdueTransfers();

    expect(second.expired).toBe(0);
    expect(await remaining()).toEqual({ capacity: 50, sold: 5, remaining: 45 });
  });

  it('срок ещё не истёк — бронь продолжает держать места', async () => {
    booking('b1', { ...overdue, paymentExpiresAt: { seconds: (NOW.getTime() + HOUR) / 1000 } });
    expect((await expireOverdueTransfers()).expired).toBe(0);
    expect(await remaining()).toMatchObject({ remaining: 47 });
  });

  it('оплата, отмеченная между запросом и записью cron, не затирается', async () => {
    booking('b1', overdue);
    // Администратор отмечает перевод полученным ровно в тот момент, когда cron
    // уже выбрал бронь запросом, но ещё не записал expired.
    const original = store.runTransaction.bind(store);
    const spy = vi.spyOn(store, 'runTransaction').mockImplementationOnce(async (fn) => {
      store.writeDoc('bookings', 'b1', { paymentStatus: 'paid', status: 'confirmed' }, 'merge');
      return original(fn);
    });

    const res = await expireOverdueTransfers();
    spy.mockRestore();

    expect(res.expired).toBe(0);
    expect(store.peek('bookings', 'b1')).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });

  it('после expired зритель не может «отменить» бронь ещё раз', async () => {
    booking('b1', overdue);
    await expireOverdueTransfers();
    await expect(userCancel('b1')).rejects.toMatchObject({ reason: 'already_cancelled' });
    expect(await remaining()).toMatchObject({ sold: 0, remaining: 50 });
  });
});

describe('остаток всегда в пределах 0…50', () => {
  it('полный зал, отмены всеми путями, повторы — sold и remaining не выходят за границы', async () => {
    // 50 мест: 10 броней по 5 билетов — часть на месте, часть переводом.
    for (let i = 0; i < 10; i++) {
      booking(`b${i}`, {
        userId:       `user-${i}`,
        ticketsCount: 5, seatsCount: 5,
        ...(i >= 8 ? { paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer',
          paymentExpiresAt: { seconds: (NOW.getTime() - HOUR) / 1000 } } : {}),
      });
    }

    const check = async () => {
      const a = await remaining();
      expect(a.sold).toBeGreaterThanOrEqual(0);
      expect(a.sold).toBeLessThanOrEqual(50);
      expect(a.remaining).toBeGreaterThanOrEqual(0);
      expect(a.remaining).toBeLessThanOrEqual(50);
      expect(a.sold + a.remaining).toBe(50);
      return a;
    };

    expect(await check()).toMatchObject({ remaining: 0 });

    await Promise.allSettled([
      cancelBookingByUser({ uid: 'user-0', bookingId: 'b0', reason: 'time', comment: '' }),
      cancelBookingByUser({ uid: 'user-0', bookingId: 'b0', reason: 'time', comment: '' }),
      cancelBookingByUser({ uid: 'user-1', bookingId: 'b1', reason: 'time', comment: '' }),
      adminCancel('b2'),
      adminCancel('b2'),
      expireOverdueTransfers(),
      expireOverdueTransfers(),
    ]);

    // Отменены b0, b1, b2 и протухли b8, b9: 5 броней × 5 мест.
    expect(await check()).toEqual({ capacity: 50, sold: 25, remaining: 25 });
    expect(summarizeBookings(adminList())).toMatchObject({ bookings: 5, tickets: 25 });
  });
});
