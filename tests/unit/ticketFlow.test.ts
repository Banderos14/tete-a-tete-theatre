// Поток билета целиком — поведением, а не текстом исходников.
//
// Бронь → письмо-билет с QR (сервер) → вход: скан → оплачено → проход, либо
// «не оплачено · XX €» → принять и пропустить. Настоящие сервисы и handler'ы
// работают поверх in-memory Firestore; наружу подменены только HTTP-обвязка,
// Firebase Auth и сам Resend (fetch).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QRCode from 'qrcode';
import { MemoryFirestore } from '../helpers/memoryFirestore';

const SERVER_TS = '<server-timestamp>';
let store = new MemoryFirestore();

vi.mock('firebase-admin/firestore', () => {
  // Метод на прототипе: in-memory Firestore клонирует документ и сохраняет
  // { seconds } — так же, как сервер его потом и читает.
  class FakeTimestamp {
    constructor(readonly seconds: number) {}
    toMillis() { return this.seconds * 1000; }
  }
  return {
    FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => '<delete>' },
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
vi.mock('../../server/shared/auth.js', () => ({
  requireCaller: async () => ({ uid: 'user-anna', idToken: 't' }),
  requireAdmin:  async () => ({ uid: 'admin-1', idToken: 't' }),
}));

let requestBody = '';
let requestHeaders: Record<string, string> = {};
const responses: Array<{ status: number; body: Record<string, unknown> }> = [];
vi.mock('../../server/shared/http.js', () => ({
  readBody: async () => requestBody,
  respond:  (_res: unknown, status: number, body: Record<string, unknown>) => { responses.push({ status, body }); },
}));

const { default: createHandler } = await import('../../api/create-booking.js');
const { runAdminBookingAction }  = await import('../../server/admin/adminBooking.service.js');
const { sendBookingEmail }       = await import('../../server/email/ticketEmail.service.js');
const { ticketQrContent, generateTicketQR } = await import('../../src/services/qrService');
const { ticketQrPayload } = await import('../../shared/domain/ticketCode.js');

// Resend: каждое письмо — запись. status по очереди из resendStatuses.
const sent: Array<Record<string, unknown>> = [];
let resendStatuses: number[] = [];

const SHOW = 'shutka'; // 02 Окт 2026, 20:00

beforeEach(() => {
  store = new MemoryFirestore();
  sent.length = 0;
  responses.length = 0;
  resendStatuses = [];
  requestHeaders = {};
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Théâtre <contact@example.com>';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T10:00:00Z'));
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as Record<string, unknown>);
    const status = resendStatuses.shift() ?? 200;
    return { ok: status < 300, status, json: async () => ({}) };
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function book(payment: 'on_site' | 'bank_transfer' = 'on_site', key = 'key-1') {
  requestBody = JSON.stringify({
    showId: SHOW, ticketType: 'standard', ticketsCount: 2, paymentMethod: payment,
    comment: '', phone: '+33 6 12 34 56 78', lang: 'RU',
  });
  requestHeaders = { 'idempotency-key': key };
  await createHandler({ method: 'POST', headers: requestHeaders } as never, {} as never);
  const res = responses[responses.length - 1]!;
  expect(res.status).toBe(200);
  return res.body as { bookingId: string; ticketCode: string; totalAmount: number; ticketEmail: string };
}

const doc = (id: string) => store.peek('bookings', id)!;
// Ответы разных действий разной формы — тест проверяет их полями.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = Record<string, any>;
const admin = (body: Record<string, unknown>) => runAdminBookingAction('admin-1', body) as Promise<AnyResult>;

describe('бронь → письмо-билет отправляет сервер', () => {
  it('успешная бронь сразу отправляет письмо с QR — без участия браузера', async () => {
    const res = await book('on_site');
    expect(res.ticketEmail).toBe('sent');
    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    expect(mail.to).toBe('anna@example.com');
    expect(String(mail.html)).toContain('cid:ticket-qr');
    expect(String(mail.html)).toContain('Покажите этот QR-код сотруднику театра при входе.');
    expect(mail.attachments).toHaveLength(1);
    expect(doc(res.bookingId).emails).toMatchObject({ booking: { status: 'sent', withQr: true } });
  });

  it('повтор того же запроса (retry) не создаёт вторую бронь и не шлёт второе письмо', async () => {
    const first  = await book('on_site', 'same-key');
    const second = await book('on_site', 'same-key');
    expect(second.bookingId).toBe(first.bookingId);
    expect(sent).toHaveLength(1);
    expect(store.listDocs('bookings')).toHaveLength(1);
  });

  it('сбой Resend не откатывает бронь, а повтор запроса дошлёт письмо', async () => {
    resendStatuses = [500];
    const first = await book('on_site', 'k');
    expect(first.ticketEmail).toBe('failed');
    expect(doc(first.bookingId).status).toBe('pending');
    expect(doc(first.bookingId).emails).toMatchObject({ booking: { status: 'failed' } });

    await book('on_site', 'k');
    expect(sent).toHaveLength(2);
    expect(doc(first.bookingId).emails).toMatchObject({ booking: { status: 'sent' } });
  });

  it('провайдер отверг картинку — письмо всё равно уходит, без QR', async () => {
    resendStatuses = [422, 200];
    const res = await book('on_site');
    expect(res.ticketEmail).toBe('sent');
    expect(sent).toHaveLength(2);
    expect(sent[1]).not.toHaveProperty('attachments');
    expect(String(sent[1]!.html)).toContain(res.ticketCode);
  });

  it('два одновременных вызова одного события — одно письмо', async () => {
    const { bookingId } = await book('on_site');
    sent.length = 0;
    await store.writeDoc('bookings', bookingId, { emails: {} }, 'merge');
    const results = await Promise.all([sendBookingEmail(bookingId, 'booking'), sendBookingEmail(bookingId, 'booking')]);
    expect(results.map(r => r.status).sort()).toEqual(['sent', 'skipped']);
    expect(sent).toHaveLength(1);
  });
});

describe('один билет — один QR в кабинете, PDF и письме', () => {
  it('кабинет/PDF и письмо кодируют одно и то же содержимое', async () => {
    const toDataUrl = vi.spyOn(QRCode, 'toDataURL');
    const toBuffer  = vi.spyOn(QRCode, 'toBuffer');

    const { ticketCode } = await book('on_site');
    // Кабинет рисует QR, и тот же data URL уходит в PDF (useTicketPdf(b, qrSrc)).
    await generateTicketQR(ticketCode);

    const accountPayload = toDataUrl.mock.calls[0]![0];
    const emailPayload   = toBuffer.mock.calls[0]![0];
    expect(accountPayload).toBe(emailPayload);
    expect(accountPayload).toBe(ticketQrPayload(ticketCode));
    expect(ticketQrContent(ticketCode)).toBe(ticketQrPayload(ticketCode));
  });

  it('повторная отправка и повторная генерация дают тот же QR', async () => {
    const toBuffer = vi.spyOn(QRCode, 'toBuffer');
    const { bookingId, ticketCode } = await book('on_site');
    await admin({ action: 'resend_ticket', bookingId });
    expect(toBuffer.mock.calls.map(c => c[0])).toEqual([ticketQrPayload(ticketCode), ticketQrPayload(ticketCode)]);
    expect(ticketQrContent(ticketCode)).toBe(ticketQrContent(ticketCode));
  });
});

describe('вход: оплаченный билет', () => {
  it('скан → оплачено → проход одним действием', async () => {
    const { bookingId, ticketCode } = await book('bank_transfer');
    await admin({ action: 'mark_paid', ticketCode });

    const scan = await admin({ action: 'inspect', ticketCode, showId: SHOW });
    expect(scan.booking).toMatchObject({ paymentStatus: 'paid', wrongShow: false });

    const pass = await admin({ action: 'mark_attended', ticketCode, showId: SHOW });
    expect(pass.booking.status).toBe('attended');
    expect(doc(bookingId)).toMatchObject({ status: 'attended', attendedBy: 'admin-1' });
  });

  it('подтверждение оплаты отправляет новое письмо-билет «оплата получена»', async () => {
    const { ticketCode } = await book('bank_transfer');
    const res = await admin({ action: 'mark_paid', ticketCode });
    expect(res.ticketEmail).toBe('sent');
    expect(sent).toHaveLength(2);
    expect(String(sent[1]!.subject)).toContain('Оплата получена');
    expect(sent[1]!.attachments).toHaveLength(1);
  });

  it('второй проход по тому же билету запрещён и знает время первого', async () => {
    const { ticketCode } = await book('bank_transfer');
    await admin({ action: 'mark_paid', ticketCode });
    await admin({ action: 'mark_attended', ticketCode, showId: SHOW });

    await expect(admin({ action: 'mark_attended', ticketCode, showId: SHOW }))
      .rejects.toMatchObject({ reason: 'already_attended' });
  });
});

describe('вход: оплата на месте', () => {
  it('сумма к оплате — из брони, оплата и проход записываются вместе', async () => {
    const { bookingId, ticketCode, totalAmount } = await book('on_site');

    const scan = await admin({ action: 'inspect', ticketCode, showId: SHOW });
    expect(scan.booking.totalAmount).toBe(totalAmount);
    expect(scan.booking.paymentStatus).toBe('not_paid');

    const res = await admin({ action: 'group_checkin', ticketCode, showId: SHOW });
    expect(res.booking).toMatchObject({ status: 'attended', paymentStatus: 'paid', totalAmount });
    expect(doc(bookingId)).toMatchObject({
      status: 'attended', paymentStatus: 'paid', paidBy: 'admin-1', attendedBy: 'admin-1',
    });
  });

  it('клиентские суммы и статусы сервер не читает', async () => {
    const { bookingId, ticketCode, totalAmount } = await book('on_site');
    await admin({
      action: 'group_checkin', ticketCode, showId: SHOW,
      totalAmount: 0, paymentStatus: 'paid', status: 'attended', cashDue: 0,
    });
    expect(doc(bookingId).totalAmount).toBe(totalAmount);
  });

  it('прошедшему в зал письмо «оплата получена» не шлётся', async () => {
    const { ticketCode } = await book('on_site');
    await admin({ action: 'group_checkin', ticketCode, showId: SHOW });
    expect(sent).toHaveLength(1); // только письмо после брони
  });
});

describe('вход: чужой спектакль, отмена', () => {
  it('билет одного спектакля не проходит на другом', async () => {
    const { bookingId, ticketCode } = await book('on_site');
    const scan = await admin({ action: 'inspect', ticketCode, showId: 'romantika' });
    expect(scan.booking.wrongShow).toBe(true);

    await expect(admin({ action: 'group_checkin', ticketCode, showId: 'romantika' }))
      .rejects.toMatchObject({ reason: 'wrong_show' });
    expect(doc(bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'not_paid' });
  });

  it('отменённая бронь не проходит, а зрителю уходит письмо об отмене', async () => {
    const { bookingId, ticketCode } = await book('on_site');
    const res = await admin({ action: 'cancel', bookingId });
    expect(res.ticketEmail).toBe('sent');
    expect(String(sent[1]!.subject)).toContain('отменено');

    await expect(admin({ action: 'group_checkin', ticketCode, showId: SHOW }))
      .rejects.toMatchObject({ reason: 'cancelled' });
    // Повторная отправка билета по отменённой брони — не отправляет.
    const resend = await admin({ action: 'resend_ticket', bookingId });
    expect(resend.ticketEmail).toBe('skipped');
  });
});

describe('«Отправить билет» из админки', () => {
  it('отправляет тот же билет ещё раз, даже если первое письмо ушло', async () => {
    const { bookingId } = await book('on_site');
    const res = await admin({ action: 'resend_ticket', bookingId });
    expect(res.ticketEmail).toBe('sent');
    expect(sent).toHaveLength(2);
    expect(doc(bookingId).emails).toMatchObject({ booking: { status: 'sent' }, resend: { status: 'sent' } });
  });

  it('неизвестное действие и кривой id отклоняются', async () => {
    await expect(admin({ action: 'make_free' })).rejects.toMatchObject({ status: 400 });
    await expect(admin({ action: 'resend_ticket', bookingId: '../x' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('матрица состояний на входе', () => {
  it('ожидающий перевод: письмо с QR, на входе — оплата и проход одной записью', async () => {
    const { bookingId, ticketCode, totalAmount } = await book('bank_transfer');
    expect(sent[0]!.attachments).toHaveLength(1);

    const scan = await admin({ action: 'inspect', ticketCode, showId: SHOW });
    expect(scan.booking).toMatchObject({ paymentStatus: 'awaiting_transfer', totalAmount });
    // Без оплаты пройти нельзя…
    await expect(admin({ action: 'mark_attended', ticketCode, showId: SHOW })).rejects.toMatchObject({ reason: 'not_paid' });
    // …«принять и пропустить» — можно, атомарно.
    await admin({ action: 'group_checkin', ticketCode, showId: SHOW });
    expect(doc(bookingId)).toMatchObject({ paymentStatus: 'paid', status: 'attended' });
  });

  it('протухшую бронь нельзя ни пропустить, ни «оплатить» в обход вместимости', async () => {
    const { bookingId, ticketCode } = await book('bank_transfer');
    store.writeDoc('bookings', bookingId, { paymentStatus: 'expired', status: 'pending' }, 'merge');
    await expect(admin({ action: 'mark_paid', ticketCode })).rejects.toMatchObject({ reason: 'expired' });
    await expect(admin({ action: 'group_checkin', ticketCode, showId: SHOW })).rejects.toMatchObject({ reason: 'expired' });
    await expect(admin({ action: 'mark_attended', ticketCode, showId: SHOW })).rejects.toMatchObject({ reason: 'expired' });
    expect(doc(bookingId).paymentStatus).toBe('expired');
  });

  it('снять оплату после прохода и отменить прошедшего нельзя', async () => {
    const { bookingId, ticketCode } = await book('on_site');
    await admin({ action: 'group_checkin', ticketCode, showId: SHOW });
    await expect(admin({ action: 'mark_unpaid', bookingId })).rejects.toMatchObject({ reason: 'already_attended' });
    await expect(admin({ action: 'cancel', bookingId })).rejects.toMatchObject({ reason: 'already_attended' });
    expect(doc(bookingId)).toMatchObject({ paymentStatus: 'paid', status: 'attended' });
  });

  it('повторное «Оплачено» не шлёт второе письмо об оплате', async () => {
    const { ticketCode } = await book('bank_transfer');
    await admin({ action: 'mark_paid', ticketCode });
    await expect(admin({ action: 'mark_paid', ticketCode })).rejects.toMatchObject({ reason: 'already_paid' });
    expect(sent.filter(m => String(m.subject).includes('Оплата получена'))).toHaveLength(1);
  });
});
