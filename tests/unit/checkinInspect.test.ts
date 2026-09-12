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

function inspect() {
  return checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'inspect' });
}
function markAttended() {
  return checkinTicket({ adminUid: 'admin-1', ticketCode: CODE, action: 'mark_attended' });
}

beforeEach(() => {
  writes = [];
  found  = true;
  // 12 сентября 2026 — за пять дней до спектакля.
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

    expect(last.booking.showRelevance).toBe(first.booking.showRelevance);
    expect(last.booking.showDateDiffers).toBe(first.booking.showDateDiffers);
    expect(last.booking.showDate).toBe(first.booking.showDate);
    expect(last.booking.status).toBe(first.booking.status);
  });
});

describe('showDateDiffers — расхождение брони с каталогом, а не с сегодняшним днём', () => {
  it('бронь 17 Сен, каталог 17 Сен, скан 12 Сен → differs = false', async () => {
    store = paidBooking();
    const res = await inspect();

    expect(res.booking.showDateDiffers).toBe(false);
    // Ранняя проверка — это отдельная концепция, не «билет на другую дату».
    expect(res.booking.showRelevance).toBe('too_early');
  });

  it('бронь 14 Июн, каталог 17 Сен → differs = true', async () => {
    store = paidBooking({ showDate: '14 Июн 2026' });
    const res = await inspect();
    expect(res.booking.showDateDiffers).toBe(true);
  });

  it('скан за день до спектакля — по-прежнему differs = false', async () => {
    vi.setSystemTime(new Date('2026-09-16T21:00:00Z'));
    store = paidBooking();
    const res = await inspect();
    expect(res.booking.showDateDiffers).toBe(false);
  });

  it('скан в день спектакля: differs = false, актуальность ok', async () => {
    vi.setSystemTime(new Date('2026-09-17T17:00:00Z')); // 19:00 по Парижу
    store = paidBooking();
    const res = await inspect();

    expect(res.booking.showDateDiffers).toBe(false);
    expect(res.booking.showRelevance).toBe('ok');
  });

  it('спектакль вне каталога не считается расхождением', async () => {
    store = paidBooking({ showId: 'snyatyj', showDate: '01 Мар 2025' });
    const res = await inspect();
    expect(res.booking.showDateDiffers).toBe(false);
  });
});

describe('действительность билета считается по сеансу брони, а не по каталогу', () => {
  it('июньский билет на перенесённый спектакль — too_late, проход запрещён', async () => {
    // Каталог romantika показывает 17 Сен, но билет продан на 14 Июн.
    store = paidBooking({ showDate: '14 Июн 2026' });

    const res = await inspect();
    expect(res.booking.showRelevance).toBe('too_late');

    await expect(markAttended()).rejects.toMatchObject({ reason: 'show_over' });
    expect(writes).toEqual([]);
  });
});
