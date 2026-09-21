// Групповой проход на входе: один QR — все активные брони аккаунта на сеанс.
//
// Проверяется поведение, а не текст исходников: настоящий репозиторий броней и
// настоящие сервисы работают поверх in-memory модели Firestore, в которой
// транзакции сериализуются так же, как в Firestore.
//
// Сценарий по умолчанию — Elena, «Романтика обречённости», 17 Сен 2026 20:00:
//   A — 2 × студент, перевод, оплачено, 30 €
//   B — 1 × обычный, оплата на месте, не оплачено, 20 €

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { screenSource } from '../helpers/serverSource.js';

const SERVER_TS = '<server-timestamp>';

let store = new MemoryFirestore();

vi.mock('firebase-admin/firestore', () => ({
  FieldValue:   { serverTimestamp: () => SERVER_TS },
  getFirestore: () => store,
}));
vi.mock('../../server/shared/firebaseAdmin.js', () => ({ getAdminApp: () => ({}) }));

// Handler: авторизацию и HTTP подменяем, сервисы — настоящие.
let adminAllowed = true;
vi.mock('../../server/shared/auth.js', async () => {
  const { forbidden } = await import('../../server/shared/errors.js');
  return {
    requireAdmin: async () => {
      if (!adminAllowed) throw forbidden('Admin only');
      return { uid: 'admin-1', idToken: 't' };
    },
  };
});
let requestBody = '';
const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
vi.mock('../../server/shared/http.js', () => ({
  readBody: async () => requestBody,
  respond:  (_res: unknown, status: number, body: Record<string, unknown>) => { responses.push({ status, body }); },
}));

const { checkinTicket }              = await import('../../server/checkin/checkin.service.js');
const { groupCheckin, inspectGroup } = await import('../../server/checkin/group.service.js');
const { default: handler }           = await import('../../api/admin-booking.js');
const { groupActionLabel, ticketsLabel } = await import('../../src/pages/TicketCheckPage/groupLabels');
type CheckinGroup = import('../../shared/contracts/checkin.js').CheckinGroup;

const USER   = 'user-elena';
const CODE_A = 'AAAA-2345';
const CODE_B = 'BBBB-2345';
const CODE_C = 'CCCC-2345';
// 17 Сен 2026, 19:00 по Парижу — за час до начала, двери открыты.
const SHOW_DAY = new Date('2026-09-17T17:00:00Z');
// 20:00 Europe/Paris (UTC+2) = 18:00Z — тот же сеанс, записанный как showStartAt.
const START_SECONDS = Date.UTC(2026, 8, 17, 18, 0) / 1000;

function seed(id: string, patch: Record<string, unknown> = {}) {
  store.seed('bookings', id, {
    showId:        'romantika',
    showTitle:     '«Романтика обреченности»',
    showDate:      '17 Сен 2026',
    showTime:      '20:00',
    userId:        USER,
    userName:      'Elena Karamzinova',
    userEmail:     'elena@example.com',
    lang:          'RU',
    ...patch,
  });
}

/** A: 2 студенческих, перевод подтверждён. Хранит showStartAt — новый формат. */
function seedA(patch: Record<string, unknown> = {}) {
  seed('A', {
    ticketCode: CODE_A, ticketType: 'student', ticketsCount: 2, seatsCount: 2, totalAmount: 30,
    paymentMethod: 'bank_transfer', paymentStatus: 'paid', status: 'confirmed',
    showStartAt: { seconds: START_SECONDS },
    ...patch,
  });
}

/** B: 1 обычный, оплата на месте. Без showStartAt — легаси-формат сеанса. */
function seedB(patch: Record<string, unknown> = {}) {
  seed('B', {
    ticketCode: CODE_B, ticketType: 'standard', ticketsCount: 1, seatsCount: 1, totalAmount: 20,
    paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending',
    ...patch,
  });
}

function seedElena() { seedA(); seedB(); }

const ids = (g: { bookings: Array<{ bookingId: string }> } | null) => g?.bookings.map(b => b.bookingId);
const doc = (id: string) => store.peek('bookings', id)!;
const run = () => groupCheckin({ adminUid: 'admin-1', ticketCode: CODE_A, showId: 'romantika' });

let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  store = new MemoryFirestore();
  adminAllowed = true;
  responses.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SHOW_DAY);
  writeSpy = vi.spyOn(store, 'writeDoc');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('состав группы', () => {
  it('1. QR A → брони A и B', async () => {
    seedElena();
    expect(ids(await inspectGroup(CODE_A))).toEqual(['A', 'B']);
  });

  it('2. QR B → та же группа с теми же итогами', async () => {
    seedElena();
    const fromA = (await inspectGroup(CODE_A))!;
    const fromB = (await inspectGroup(CODE_B))!;

    expect(ids(fromB)).toEqual(ids(fromA));
    expect({ ...fromB, scannedBookingId: '', bookings: [] }).toEqual({ ...fromA, scannedBookingId: '', bookings: [] });
    expect(fromA.scannedBookingId).toBe('A');
    expect(fromB.scannedBookingId).toBe('B');
  });

  it('3. тот же зритель, другой спектакль — не входит', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, showId: 'shutka', showDate: '17 Сен 2026', showTime: '20:00',
      ticketsCount: 1, seatsCount: 1, totalAmount: 20,
      paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending',
    });
    expect(ids(await inspectGroup(CODE_A))).toEqual(['A', 'B']);
  });

  it('4. тот же зритель и спектакль, другой сеанс — не входит', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, showDate: '14 Июн 2026', showTime: '20:00',
      ticketsCount: 4, seatsCount: 4, totalAmount: 80,
      paymentMethod: 'bank_transfer', paymentStatus: 'paid', status: 'confirmed',
    });
    const group = await inspectGroup(CODE_A);
    expect(ids(group)).toEqual(['A', 'B']);
    expect(group!.totalTickets).toBe(3);
  });

  it('4b. бронь, купленная до исправления времени в каталоге, — тот же сеанс', async () => {
    seedElena();
    // Тот же день, другое время: у спектакля один сеанс в день, значит время
    // просто поправили (16:00 → 20:00), а билет — на этот же вечер.
    seed('D', {
      ticketCode: 'DDDD-2345', showTime: '16:00',
      ticketsCount: 1, seatsCount: 1, totalAmount: 20,
      paymentMethod: 'bank_transfer', paymentStatus: 'paid', status: 'confirmed',
    });
    const group = await inspectGroup(CODE_A, 'romantika');
    expect(ids(group)).toEqual(['A', 'B', 'D']);
  });

  it('5. другой пользователь с тем же e-mail и именем — не входит', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, userId: 'someone-else',
      ticketsCount: 1, seatsCount: 1, totalAmount: 20,
      paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending',
    });
    expect(ids(await inspectGroup(CODE_A))).toEqual(['A', 'B']);

    await run();
    expect(doc('C').status).toBe('pending');
    expect(doc('C').paymentStatus).toBe('not_paid');
  });

  it('6. легаси-бронь без userId не группируется по e-mail', async () => {
    seedA({ userId: undefined });
    seedB({ userId: undefined });

    expect(await inspectGroup(CODE_A)).toBeNull();
    await expect(run()).rejects.toMatchObject({ reason: 'no_group' });
    expect(writeSpy).not.toHaveBeenCalled();

    // Одиночный проход по такому билету работает как прежде.
    const single = await checkinTicket({ adminUid: 'admin-1', ticketCode: CODE_A, action: 'mark_attended', showId: 'romantika' });
    expect(single.booking.status).toBe('attended');
    expect(doc('B').status).toBe('pending');
  });

  it('одна бронь на сеанс — группы нет, сканер остаётся одиночным', async () => {
    seedA();
    expect(await inspectGroup(CODE_A)).toBeNull();
  });
});

describe('оплата', () => {
  it('7. к оплате на месте — только сумма B', async () => {
    seedElena();
    const group = (await inspectGroup(CODE_A))!;
    expect(group.cashDue).toBe(20);
    expect(group.paidAmount).toBe(30);
    expect(group.canCheckIn).toBe(true);
  });

  it('8. групповое действие: B становится оплаченной, A остаётся оплаченной', async () => {
    seedElena();
    const res = await run();

    expect(doc('B')).toMatchObject({
      paymentStatus: 'paid', status: 'attended',
      paidAt: SERVER_TS, paidBy: 'admin-1', attendedAt: SERVER_TS, attendedBy: 'admin-1', updatedAt: SERVER_TS,
    });
    expect(doc('A')).toMatchObject({ paymentStatus: 'paid', status: 'attended', attendedBy: 'admin-1' });
    // Оплату A никто не трогал: полей приёма наличных у неё нет.
    expect(doc('A')).not.toHaveProperty('paidBy');
    expect(doc('A')).not.toHaveProperty('paidAt');

    expect(res.group.cashDue).toBe(0);
    expect(res.group.paidAmount).toBe(50);
  });

  it('поля B совпадают с одиночными mark_paid + mark_attended', async () => {
    seedB();
    await checkinTicket({ adminUid: 'admin-1', ticketCode: CODE_B, action: 'mark_paid' });
    await checkinTicket({ adminUid: 'admin-1', ticketCode: CODE_B, action: 'mark_attended', showId: 'romantika' });
    const sequential = doc('B');

    store = new MemoryFirestore();
    seedElena();
    await run();
    expect(doc('B')).toEqual(sequential);
  });

  it('9. непришедший перевод принимается на входе вместе с остальными — тупика у двери нет', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, ticketsCount: 1, seatsCount: 1, totalAmount: 15,
      paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer', status: 'pending',
    });

    const group = (await inspectGroup(CODE_A))!;
    expect(group.canCheckIn).toBe(true);
    expect(group.blockedBookingIds).toEqual([]);
    // К оплате — суммы из самих броней: B 20 € + C 15 €.
    expect(group.cashDue).toBe(35);

    await run();
    expect(doc('C')).toMatchObject({ paymentStatus: 'paid', status: 'attended' });
    expect(doc('B')).toMatchObject({ paymentStatus: 'paid', status: 'attended' });
  });

  it('9b. неизвестный статус оплаты блокирует групповой проход', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, ticketsCount: 1, seatsCount: 1, totalAmount: 15,
      paymentMethod: 'bank_transfer', paymentStatus: 'refund_requested', status: 'pending',
    });
    const group = (await inspectGroup(CODE_A))!;
    expect(group.blockedBookingIds).toEqual(['C']);
    await expect(run()).rejects.toMatchObject({ reason: 'payment_pending' });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('10. отменённая бронь не учитывается', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, ticketsCount: 3, seatsCount: 3, totalAmount: 60,
      paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'cancelled',
    });
    const group = (await inspectGroup(CODE_A))!;
    expect(ids(group)).toEqual(['A', 'B']);
    expect(group.totalTickets).toBe(3);
    expect(group.cashDue).toBe(20);

    await run();
    expect(doc('C').status).toBe('cancelled');
    expect(doc('C').paymentStatus).toBe('not_paid');
  });

  it('11. протухшая бронь не учитывается', async () => {
    seedElena();
    // Протухший перевод со статусом, который забыли перевести в cancelled.
    seed('C', {
      ticketCode: CODE_C, ticketsCount: 2, seatsCount: 2, totalAmount: 40,
      paymentMethod: 'bank_transfer', paymentStatus: 'expired', status: 'pending',
    });
    const group = (await inspectGroup(CODE_A))!;
    expect(ids(group)).toEqual(['A', 'B']);
    expect(group.canCheckIn).toBe(true);

    await run();
    expect(doc('C').status).toBe('pending');
  });
});

describe('посещение', () => {
  it('12. A и B не прошли → одно действие → обе attended', async () => {
    seedElena();
    const res = await run();
    expect(doc('A').status).toBe('attended');
    expect(doc('B').status).toBe('attended');
    expect(res.group.attendedTickets).toBe(3);
    expect(res.group.remainingTickets).toBe(0);
  });

  it('13. A уже прошла, B нет → меняется только B', async () => {
    seedA({ status: 'attended', attendedAt: 'earlier', attendedBy: 'admin-0' });
    seedB();
    const before = doc('A');

    const group = (await inspectGroup(CODE_B))!;
    expect(group.totalTickets).toBe(3);
    expect(group.attendedTickets).toBe(2);
    expect(group.remainingTickets).toBe(1);
    expect(group.remainingBookings).toBe(1);

    await groupCheckin({ adminUid: 'admin-1', ticketCode: CODE_B, showId: 'romantika' });
    expect(doc('A')).toEqual(before);
    expect(doc('B').status).toBe('attended');
  });

  it('14. все прошли → действия нет', async () => {
    seedA({ status: 'attended' });
    seedB({ status: 'attended', paymentStatus: 'paid' });

    const group = (await inspectGroup(CODE_A))!;
    expect(group.canCheckIn).toBe(false);
    expect(group.remainingTickets).toBe(0);

    await expect(run()).rejects.toMatchObject({ reason: 'already_attended' });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('15. два одновременных групповых действия → ровно один эффективный переход', async () => {
    seedElena();
    const results = await Promise.allSettled([
      groupCheckin({ adminUid: 'admin-1', ticketCode: CODE_A, showId: 'romantika' }),
      groupCheckin({ adminUid: 'admin-2', ticketCode: CODE_B, showId: 'romantika' }),
    ]);

    const ok       = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ reason: 'already_attended' });

    // Одна транзакция — две записи (A и B), без повторов.
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(doc('B').paidBy).toBe(doc('A').attendedBy);
  });

  it('16. десять сканов → ноль записей', async () => {
    seedElena();
    const before = JSON.stringify(store.listDocs('bookings'));

    for (let i = 0; i < 10; i++) {
      await checkinTicket({ adminUid: 'admin-1', ticketCode: i % 2 ? CODE_A : CODE_B, action: 'inspect' });
      await inspectGroup(i % 2 ? CODE_A : CODE_B);
    }

    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(store.listDocs('bookings'))).toBe(before);
  });

  it('17. скан после группового прохода показывает группу использованной', async () => {
    seedElena();
    await run();

    const group = (await inspectGroup(CODE_B))!;
    expect(ids(group)).toEqual(['A', 'B']);
    expect(group.bookings.every(b => b.status === 'attended')).toBe(true);
    expect(group.remainingTickets).toBe(0);
    expect(group.canCheckIn).toBe(false);
  });
});

describe('суммы', () => {
  it('18–20. билеты, к оплате на месте, уже оплачено', async () => {
    seedElena();
    seed('C', {
      ticketCode: CODE_C, ticketType: 'standard', ticketsCount: 2, seatsCount: 2, totalAmount: 40,
      paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending',
    });
    const group = (await inspectGroup(CODE_A))!;
    expect(group.bookingsCount).toBe(3);
    expect(group.totalTickets).toBe(5);
    expect(group.cashDue).toBe(60);
    expect(group.paidAmount).toBe(30);
  });

  it('21. скидка лояльности: берётся сохранённый totalAmount, а не цена каталога', async () => {
    seedA();
    seedB({ totalAmount: 10, originalAmount: 20, loyaltyDiscountApplied: true });
    const group = (await inspectGroup(CODE_A))!;
    expect(group.cashDue).toBe(10);
  });

  it('тип билета подписан по каталогу', async () => {
    seedElena();
    const group = (await inspectGroup(CODE_A))!;
    expect(group.bookings.map(b => b.ticketTypeLabel)).toEqual(['Ученик / студент', 'Обычный']);
  });
});

describe('безопасность', () => {
  it('22. не-админ получает отказ, брони не читаются и не меняются', async () => {
    seedElena();
    adminAllowed = false;
    requestBody = JSON.stringify({ ticketCode: CODE_A, action: 'group_checkin', showId: 'romantika' });

    await handler({ method: 'POST', headers: {} } as never, {} as never);

    expect(responses[0]!.status).toBe(403);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(doc('B').paymentStatus).toBe('not_paid');
  });

  it('handler: inspect возвращает группу, group_checkin выполняет проход', async () => {
    seedElena();
    requestBody = JSON.stringify({ ticketCode: CODE_A, action: 'inspect' });
    await handler({ method: 'POST', headers: {} } as never, {} as never);
    expect(responses[0]!.status).toBe(200);
    expect(ids(responses[0]!.body.group as never)).toEqual(['A', 'B']);
    expect(writeSpy).not.toHaveBeenCalled();

    requestBody = JSON.stringify({ ticketCode: CODE_A, action: 'group_checkin', showId: 'romantika' });
    await handler({ method: 'POST', headers: {} } as never, {} as never);
    expect(responses[1]!.status).toBe(200);
    expect(doc('B').status).toBe('attended');

    // Клиентские суммы и списки броней сервер не читает вовсе.
    requestBody = JSON.stringify({ ticketCode: CODE_A, action: 'group_checkin', showId: 'romantika', bookingIds: ['Z'], cashDue: 0 });
    await handler({ method: 'POST', headers: {} } as never, {} as never);
    expect(responses[2]!.status).toBe(409);
    expect(responses[2]!.body.reason).toBe('already_attended');
  });

  it('23. QR отменённой брони не открывает проход по остальным', async () => {
    seedA({ status: 'cancelled' });
    seedB();

    expect(await inspectGroup(CODE_A)).toBeNull();
    await expect(run()).rejects.toMatchObject({ reason: 'cancelled' });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(doc('B').status).toBe('pending');
  });

  it('24. QR протухшей брони не открывает проход по остальным', async () => {
    seedA({ status: 'cancelled', paymentStatus: 'expired' });
    seedB();
    await expect(run()).rejects.toMatchObject({ reason: 'cancelled' });

    seedA({ status: 'pending', paymentStatus: 'expired' });
    expect(await inspectGroup(CODE_A)).toBeNull();
    await expect(run()).rejects.toMatchObject({ reason: 'expired' });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(doc('B').status).toBe('pending');
  });

  it('25. билеты другого вечера — групповой проход на этот спектакль запрещён', async () => {
    seedA({ showStartAt: undefined, showDate: '14 Июн 2026' });
    seedB({ showDate: '14 Июн 2026' });

    expect(await inspectGroup(CODE_A, 'romantika')).toBeNull();
    await expect(run()).rejects.toMatchObject({ reason: 'wrong_show' });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('исторический билет не подтягивает сегодняшние брони', async () => {
    seedA({ showStartAt: undefined, showDate: '14 Июн 2026', paymentStatus: 'paid' });
    seedB(); // бронь того же зрителя на текущий показ
    await expect(run()).rejects.toMatchObject({ reason: 'wrong_show' });
    expect(doc('B').status).toBe('pending');
  });

  it('билет другого спектакля не проходит на выбранном', async () => {
    seedElena();
    await expect(groupCheckin({ adminUid: 'admin-1', ticketCode: CODE_A, showId: 'shutka' }))
      .rejects.toMatchObject({ reason: 'wrong_show' });
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('письмо об оплате', () => {
  it('26. в список писем попадает только бронь, перешедшая not_paid → paid', async () => {
    seedElena();
    const res = await run();
    expect(res.paidBookings.map(b => b.bookingId)).toEqual(['B']);
    expect(res.paidBookings[0]).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', totalAmount: 20 });
  });

  it('27. повтор не даёт второго перехода оплаты и второго письма', async () => {
    seedElena();
    await run();
    const afterFirst = doc('B');
    writeSpy.mockClear();

    const retry = await run().catch(e => e as { reason: string; details?: { group?: unknown } });
    expect(retry).toMatchObject({ reason: 'already_attended' });
    expect(retry).not.toHaveProperty('paidBookings');
    expect(writeSpy).not.toHaveBeenCalled();
    expect(doc('B')).toEqual(afterFirst);
  });

  it('сканер писем не отправляет — это делает сервер', () => {
    const scanner = screenSource('src/pages/TicketCheckPage');
    expect(scanner).not.toContain('sendPaymentPaidEmail');
    expect(scanner).not.toContain('/api/send-email');
  });
});

describe('подпись основной кнопки', () => {
  const base = { cashDue: 0, attendedTickets: 0, remainingTickets: 3 } as CheckinGroup;

  it('всё оплачено', () => {
    expect(groupActionLabel(base)).toBe('Отметить посещение — 3 билета');
  });
  it('часть к оплате на месте', () => {
    expect(groupActionLabel({ ...base, cashDue: 20 })).toBe('Принять 20 € и отметить 3 билета');
  });
  it('часть уже прошла', () => {
    expect(groupActionLabel({ ...base, attendedTickets: 2, remainingTickets: 1 })).toBe('Отметить оставшийся 1 билет');
    expect(groupActionLabel({ ...base, attendedTickets: 2, remainingTickets: 1, cashDue: 20 }))
      .toBe('Принять 20 € и отметить 1 билет');
  });
  it('склонения', () => {
    expect([1, 2, 5, 11, 21, 22].map(ticketsLabel))
      .toEqual(['1 билет', '2 билета', '5 билетов', '11 билетов', '21 билет', '22 билета']);
  });
});

describe('границы изменения', () => {
  it('клиент передаёт в group_checkin только код билета и спектакль', () => {
    const scanner = screenSource('src/pages/TicketCheckPage');
    expect(scanner).toContain("'group_checkin'");
    expect(scanner).toContain('adminBookingAction({ action, ticketCode, showId })');
  });

  it('админка групповой проход не использует', () => {
    const admin = screenSource('src/pages/AdminPage');
    expect(admin).not.toContain('group_checkin');
  });
});

describe('времени у прохода нет', () => {
  it('за день до спектакля группа проходит — важен спектакль, а не час', async () => {
    seedElena();
    vi.setSystemTime(new Date('2026-09-16T17:00:00Z'));

    const group = (await inspectGroup(CODE_A, 'romantika'))!;
    expect(group.canCheckIn).toBe(true);
    await run();
    expect(doc('B')).toMatchObject({ paymentStatus: 'paid', status: 'attended' });
  });
});
