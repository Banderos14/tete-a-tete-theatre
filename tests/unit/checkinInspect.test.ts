// Скан ≠ проход.
//
// Сканировать QR можно сколько угодно раз: сотрудник мог плохо считать код,
// захотеть перепроверить данные или случайно закрыть сканер. Использованным
// билет делает ТОЛЬКО явное действие «Отметить посещение» (mark_attended).
//
// Firestore здесь подменён минимальной моделью: транзакция выполняется, записи
// применяются к общему документу. Это позволяет проверить не текст исходника,
// а поведение — сколько бы inspect'ов ни пришло, документ остаётся прежним.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SERVER_TS = '<server-timestamp>';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => SERVER_TS },
}));

// Общий «документ брони» и журнал записей. Сбрасываются перед каждым тестом.
let store: Record<string, unknown> = {};
let writes: Array<Record<string, unknown>> = [];
let found = true;

vi.mock('../../server/booking/booking.repository.js', () => ({
  db: () => ({
    // Транзакция Firestore сериализует конфликтующие операции, поэтому
    // последовательный прогон — честная модель её гарантии.
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        update: (_ref: unknown, data: Record<string, unknown>) => {
          writes.push(data);
          Object.assign(store, data);
        },
      };
      return fn(tx);
    },
  }),
  findByTicketCode: async () => (found ? { ref: {}, id: 'booking-1', data: store } : null),
  bookingsRef: () => ({}),
  SHOW_COUNTERS: 'showCounters',
}));

const { checkinTicket } = await import('../../server/checkin/checkin.service.js');

const CODE = 'ABCD-2345';

/** Оплаченная подтверждённая бронь на romantika — 17 Сен 2026, 20:00. */
function paidBooking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    showId:        'romantika',
    showTitle:     '«Романтика обреченности»',
    showDate:      '17 Сен 2026',
    showTime:      '20:00',
    userName:      'Зритель',
    userEmail:     'spectateur@example.com',
    lang:          'RU',
    ticketsCount:  2,
    totalAmount:   30,
    status:        'confirmed',
    paymentStatus: 'paid',
    paymentMethod: 'bank_transfer',
    ...overrides,
  };
}

function inspect(showId: string = 'romantika') {
  return checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'inspect', showId });
}
function markAttended(showId: string = 'romantika') {
  return checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'mark_attended', showId });
}

beforeEach(() => {
  writes = [];
  found  = true;
  // 12 сентября 2026 — за пять дней до спектакля: времени у прохода нет,
  // поэтому все проверки работают в любой день.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('inspect — только чтение', () => {
  it('десять сканов подряд не меняют бронь', async () => {
    store = paidBooking();
    const before = JSON.stringify(store);

    for (let i = 0; i < 10; i++) {
      const res = await inspect();
      expect(res.ok).toBe(true);
      expect(res.changed).toBe(false);
      expect(res.booking.status).toBe('confirmed');
    }

    expect(writes).toEqual([]);
    expect(JSON.stringify(store)).toBe(before);
  });

  it('inspect не трогает ни статус, ни оплату, ни служебные поля', async () => {
    store = paidBooking();
    await inspect();
    await inspect();

    for (const field of ['attendedAt', 'attendedBy', 'updatedAt', 'paidAt', 'expiredAt']) {
      expect(store, field).not.toHaveProperty(field);
    }
    expect(store.status).toBe('confirmed');
    expect(store.paymentStatus).toBe('paid');
  });

  it('inspect читает и уже использованный билет, не ломаясь', async () => {
    store = paidBooking({ status: 'attended' });
    const res = await inspect();
    expect(res.ok).toBe(true);
    expect(res.booking.status).toBe('attended');
    expect(writes).toEqual([]);
  });

  it('inspect не отказывает неоплаченной брони — сотрудник должен увидеть данные', async () => {
    store = paidBooking({ paymentStatus: 'not_paid', paymentMethod: 'on_site', status: 'pending' });
    const res = await inspect();
    expect(res.ok).toBe(true);
    expect(res.booking.paymentStatus).toBe('not_paid');
    expect(writes).toEqual([]);
  });
});

describe('mark_attended — единственное действие, делающее билет использованным', () => {
  it('inspect → inspect → mark_attended → inspect → already_attended', async () => {
    store = paidBooking();

    await inspect();
    await inspect();
    expect(writes).toEqual([]);

    const marked = await markAttended();
    expect(marked.changed).toBe(true);
    expect(marked.booking.status).toBe('attended');
    expect(store.status).toBe('attended');
    expect(store.attendedAt).toBe(SERVER_TS);
    expect(store.attendedBy).toBe('admin-1');

    // Скан после прохода читается по-прежнему — и показывает «использован».
    const after = await inspect();
    expect(after.ok).toBe(true);
    expect(after.booking.status).toBe('attended');
    expect(marked.booking.attendedAtMs).toBe(Date.now());

    await expect(markAttended()).rejects.toMatchObject({ reason: 'already_attended' });
  });

  it('второй mark_attended подряд отклоняется', async () => {
    store = paidBooking();
    await markAttended();
    await expect(markAttended()).rejects.toMatchObject({ reason: 'already_attended' });
    // Записана ровно одна отметка прохода.
    expect(writes.filter(w => w.status === 'attended')).toHaveLength(1);
  });

  it('параллельные mark_attended: успешен ровно один', async () => {
    store = paidBooking();
    const results = await Promise.allSettled([markAttended(), markAttended()]);

    const ok       = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];

    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ reason: 'already_attended' });
    expect(writes.filter(w => w.status === 'attended')).toHaveLength(1);
  });

  it('число сканов не влияет ни на дату, ни на действительность', async () => {
    store = paidBooking();

    const first = await inspect();
    for (let i = 0; i < 7; i++) await inspect();
    const last = await inspect();

    expect(last.booking.wrongShow).toBe(first.booking.wrongShow);
    expect(last.booking.showDate).toBe(first.booking.showDate);
    expect(last.booking.status).toBe(first.booking.status);
  });
});

describe('проход — без временного окна, но только на свой спектакль', () => {
  it('за пять дней до спектакля оплаченный билет проходит — времени у прохода нет', async () => {
    store = paidBooking();
    const res = await markAttended();
    expect(res.booking.status).toBe('attended');
  });

  it('билет другого спектакля: скан показывает его, проход — wrong_show', async () => {
    store = paidBooking();
    const res = await inspect('shutka');
    expect(res.booking.wrongShow).toBe(true);
    expect(res.booking.showTitle).toBe('«Романтика обреченности»');

    await expect(markAttended('shutka')).rejects.toMatchObject({ reason: 'wrong_show' });
    expect(writes).toEqual([]);
  });

  it('июньский билет перенесённого спектакля — другой вечер, проход запрещён', async () => {
    store = paidBooking({ showDate: '14 Июн 2026', showTime: '19:00' });
    expect((await inspect()).booking.wrongShow).toBe(true);
    await expect(markAttended()).rejects.toMatchObject({ reason: 'wrong_show' });
    expect(writes).toEqual([]);
  });

  it('без указания спектакля проход не отмечается вовсе', async () => {
    store = paidBooking();
    await expect(checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'mark_attended' }))
      .rejects.toMatchObject({ reason: 'bad_show' });
    expect(writes).toEqual([]);
  });

  it('отменённая и протухшая брони не проходят', async () => {
    store = paidBooking({ status: 'cancelled' });
    await expect(markAttended()).rejects.toMatchObject({ reason: 'cancelled' });
    store = paidBooking({ status: 'pending', paymentStatus: 'expired' });
    await expect(markAttended()).rejects.toMatchObject({ reason: 'expired' });
    expect(writes).toEqual([]);
  });

  it('оплату можно принять в любой день — спектакль для неё не нужен', async () => {
    store = paidBooking({ paymentStatus: 'not_paid', paymentMethod: 'on_site', status: 'pending' });
    const res = await checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'mark_paid' });
    expect(res.booking.paymentStatus).toBe('paid');
  });

  it('оплата уже прошедшему зрителю не возвращает его в «confirmed»', async () => {
    store = paidBooking({ paymentStatus: 'not_paid', status: 'attended' });
    await checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'mark_paid' });
    expect(store.status).toBe('attended');
    expect(store.paymentStatus).toBe('paid');
  });

  it('повторный скан отдаёт время первого прохода', async () => {
    store = paidBooking({ status: 'attended', attendedAt: { seconds: 1_789_000_000 } });
    const res = await inspect();
    expect(res.booking.attendedAtMs).toBe(1_789_000_000_000);
  });
});
