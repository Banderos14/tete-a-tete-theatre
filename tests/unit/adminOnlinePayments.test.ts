// Phase 5: онлайн-оплата в админке, ручной возврат через Stripe Dashboard,
// защита удаления и сверка возвратов в cron.
//
// Сервисы работают поверх in-memory Firestore; Stripe подменён фейком только
// для чтения возвратов (list / retrieve) — Refund API приложение не вызывает.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryFirestore } from '../helpers/memoryFirestore';
import { projectSource } from '../helpers/serverSource.js';

let store = new MemoryFirestore();

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '<ts>', delete: () => '<delete>' },
  Timestamp:  { fromMillis: (ms: number) => ({ seconds: ms / 1000 }) },
  getFirestore: () => store,
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: async () => ({}) }) }));
vi.mock('../../server/shared/firebaseAdmin.js', () => ({ getAdminApp: () => ({}) }));

type FakeRefund = { id: string; object: 'refund'; amount: number; currency: string; payment_intent: string; status: string };
/** Все возвраты в Stripe (retrieve). */
let stripeRefunds: FakeRefund[] = [];
/** Что вернёт список «недавних» (list); по умолчанию — все. */
let recentRefunds: FakeRefund[] | null = null;
let stripeConfigured = true;
const listCalls: unknown[] = [];

vi.mock('../../server/payments/stripe.client.js', async () => {
  const { ApiError } = await import('../../server/shared/errors.js');
  return {
    getStripe: () => {
      if (!stripeConfigured) throw new ApiError(503, 'not configured', 'online_payment_unavailable');
      return {
        refunds: {
          list: (params: unknown) => {
            listCalls.push(params);
            const items = [...(recentRefunds ?? stripeRefunds)];
            return { async *[Symbol.asyncIterator]() { for (const r of items) yield r; } };
          },
          retrieve: async (id: string) => {
            const r = stripeRefunds.find(x => x.id === id);
            if (!r) throw new Error('No such refund');
            return r;
          },
        },
        checkout: { sessions: { retrieve: async () => { throw new Error('unused'); }, expire: async () => { throw new Error('unused'); } } },
      };
    },
    expectedLivemode:       () => false,
    isOnlinePaymentEnabled: () => true,
  };
});

const { deleteCancelledBooking } = await import('../../server/booking/deletion.service.js');
const { cancelBookingByAdmin, markUnpaidByAdmin } = await import('../../server/booking/admin.service.js');
const { checkinTicket } = await import('../../server/checkin/checkin.service.js');
const { reconcileRefund } = await import('../../server/payments/refundSync.service.js');
const { reconcileRefunds } = await import('../../server/payments/reconcile.service.js');
const { refundViewOf } = await import('../../server/payments/onlinePayment.js');
const { readShowAvailability } = await import('../../server/availability/availability.service.js');
const { ApiError } = await import('../../server/shared/errors.js');
const { financialHold, isScannableTicket } = await import('../../shared/domain/bookingRules.js');
const {
  adminPaymentState, paymentMethodLabel, paymentIssueText, deletionBlockedReason,
} = await import('../../src/pages/AdminPage/adminFormatting');
const { onlineBookingState, canResumeCheckout } = await import('../../src/utils/onlinePayment');

const SHOW = 'shutka';
const PI   = 'pi_test_1';
const B    = 'b1';

function seed(patch: Record<string, unknown> = {}, id = B) {
  store.seed('bookings', id, {
    userId: 'u1', userEmail: 'anna@example.com', userName: 'Anna', showId: SHOW,
    showTitle: 'Шутка', showDate: '02 Окт 2026', showTime: '20:00',
    ticketsCount: 2, seatsCount: 2, ticketType: 'standard', totalAmount: 45,
    ticketCode: 'ABCD-2345', status: 'confirmed', paymentMethod: 'online', paymentStatus: 'paid',
    stripeCheckoutSessionId: 'cs_test_1', stripePaymentIntentId: PI, lang: 'RU',
    ...patch,
  });
}
const refund = (patch: Partial<FakeRefund> = {}): FakeRefund =>
  ({ id: 're_test_1', object: 'refund', amount: 4500, currency: 'eur', payment_intent: PI, status: 'pending', ...patch });
const sync = (r: FakeRefund) => reconcileRefund(refundViewOf(r as never));
const booking = (id = B) => store.peek('bookings', id)!;

async function refusal(p: Promise<unknown>): Promise<InstanceType<typeof ApiError>> {
  try { await p; } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('ожидался отказ');
}

beforeEach(() => {
  store = new MemoryFirestore();
  stripeRefunds = [];
  recentRefunds = null;
  stripeConfigured = true;
  listCalls.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ── Админка: подписи ────────────────────────────────────────────────────────

describe('админка: состояние онлайн-оплаты по-человечески', () => {
  const on = (patch: Record<string, unknown>) =>
    ({ paymentMethod: 'online', status: 'confirmed', paymentStatus: 'paid', ...patch }) as never;

  it.each([
    [{ paymentStatus: 'awaiting_online', status: 'pending' }, 'Ожидает онлайн-оплаты', 'awaiting'],
    [{}, 'Оплачено онлайн', 'paid'],
    [{ status: 'cancelled', refund: { id: 'r', status: 'pending' } }, 'Возврат обрабатывается', 'awaiting'],
    [{ status: 'cancelled', paymentStatus: 'refunded', refund: { id: 'r', status: 'succeeded' } }, 'Возвращено', 'expired'],
    [{ status: 'cancelled', refund: { id: 'r', status: 'failed' }, paymentIssue: 'refund_failed' }, 'Возврат не выполнен', 'issue'],
    [{ status: 'cancelled', paymentIssue: 'paid_after_cancel' }, 'Требуется проверка', 'issue'],
    [{ paymentStatus: 'awaiting_online', status: 'pending', paymentIssue: 'amount_mismatch' }, 'Требуется проверка', 'issue'],
  ])('%j → %s', (patch, label, tone) => {
    expect(adminPaymentState(on(patch))).toEqual({ label, tone });
  });

  it('наличные, перевод и старые брони — как раньше', () => {
    expect(adminPaymentState({ paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending' } as never))
      .toEqual({ label: 'Не оплачено', tone: 'notPaid' });
    expect(adminPaymentState({ paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer', status: 'pending' } as never))
      .toEqual({ label: 'Ожидает перевода', tone: 'awaiting' });
    expect(adminPaymentState({ paymentMethod: 'bank_transfer', paymentStatus: 'paid', status: 'confirmed' } as never))
      .toEqual({ label: 'Оплачено', tone: 'paid' });
    expect(adminPaymentState({ status: 'pending' } as never)).toEqual({ label: 'Не оплачено', tone: 'notPaid' });
  });

  it('способ оплаты различим: на месте / перевод / онлайн · Stripe (раньше онлайн показывался «Перевод»)', () => {
    expect(paymentMethodLabel('on_site')).toBe('На месте');
    expect(paymentMethodLabel('bank_transfer')).toBe('Перевод');
    expect(paymentMethodLabel('online')).toBe('Онлайн · Stripe');
    expect(paymentMethodLabel(undefined)).toBe('На месте');
  });

  it('проблема оплаты объясняется без данных Stripe', () => {
    for (const issue of ['paid_after_cancel', 'amount_mismatch', 'partial_refund', 'refund_failed']) {
      const text = paymentIssueText(issue)!;
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/pi_|cs_|re_|\{/);
    }
    expect(paymentIssueText(undefined)).toBeNull();
    expect(paymentIssueText('something_new')).toContain('проверки');
  });

  const tab  = projectSource('src/pages/AdminPage/BookingsTab.tsx');
  const data = projectSource('src/pages/AdminPage/useAdminData.ts');

  it('для онлайн-оплаты нет «Оплачено» / «Не оплачено» — вместо них пояснение', () => {
    expect(tab).toContain("{bStatus !== 'cancelled' && !isOnline && (");
    expect(tab).toContain('Оплату подтверждает Stripe');
  });

  it('оплаченную онлайн бронь нельзя просто отменить: вместо кнопки — инструкция возврата в Stripe', () => {
    expect(tab).toContain("const refundInStripe = isOnline && payStatus === 'paid' && bStatus !== 'cancelled';");
    expect(tab).toContain("{bStatus !== 'attended' && !refundInStripe && (");
    expect(tab).toContain('{REFUND_IN_STRIPE_HINT}');
    expect(data).toMatch(/refund_required:\s+'Эта бронь оплачена онлайн\. Сначала выполните возврат в Stripe/);
  });

  it('проблема оплаты заметна: блок «Требуется проверка оплаты» и подсветка строки', () => {
    expect(tab).toContain('<strong>Требуется проверка оплаты</strong>');
    expect(tab).toContain('styles.rowIssue');
  });

  it('детализация Stripe — только id и статусы, без сырых объектов', () => {
    const details = tab.slice(tab.indexOf('function StripeDetails'), tab.indexOf('function lastTicketEmail'));
    expect(details).toContain('<details');
    expect(details).not.toMatch(/JSON\.stringify|paymentIssueDetails/);
  });

  it('корзина — только у финансово закрытой брони; тексты отказов сервера понятные', () => {
    expect(tab).toMatch(/bStatus === 'cancelled' && deleteBlocked \? \(/);
    expect(data).toContain('financial_hold:');
    expect(data).toContain('online_payment:');
  });
});

// ── Удаление ────────────────────────────────────────────────────────────────

describe('удаление: финансово незавершённую бронь сервер не удаляет', () => {
  it.each([
    ['оплата после отмены (paid_after_cancel)', { status: 'cancelled', paymentIssue: 'paid_after_cancel' }, 'payment_issue'],
    ['возврат обрабатывается', { status: 'cancelled', refund: { id: 're', status: 'pending', amount: 45 } }, 'refund_pending'],
    ['возврат не выполнен', { status: 'cancelled', refund: { id: 're', status: 'failed', amount: 45 }, paymentIssue: 'refund_failed' }, 'refund_failed'],
    ['оплачено онлайн и не возвращено', { status: 'cancelled' }, 'paid_online'],
    ['несовпадение суммы', { status: 'cancelled', paymentStatus: 'awaiting_online', paymentIssue: 'amount_mismatch' }, 'payment_issue'],
  ])('%s → 409 financial_hold', async (_label, patch, hold) => {
    seed(patch);
    const err = await refusal(deleteCancelledBooking('admin-1', B, store as never));
    expect(err.status).toBe(409);
    expect(err.reason).toBe('financial_hold');
    expect(err.details).toEqual({ hold });
    expect(booking()).toBeDefined();
    expect(financialHold(booking() as never)).toBe(hold);
    expect(deletionBlockedReason(booking() as never)).not.toBeNull();
  });

  it('полностью возвращённая отменённая бронь удаляется', async () => {
    seed({ status: 'cancelled', paymentStatus: 'refunded', refund: { id: 're', status: 'succeeded', amount: 45 } });
    await deleteCancelledBooking('admin-1', B, store as never);
    expect(store.peek('bookings', B)).toBeUndefined();
  });

  it('наличные и перевод — прежнее правило: отменённую можно удалить', async () => {
    seed({ status: 'cancelled', paymentMethod: 'on_site', paymentStatus: 'not_paid', stripePaymentIntentId: null }, 'b-cash');
    seed({ status: 'cancelled', paymentMethod: 'bank_transfer', paymentStatus: 'expired', stripePaymentIntentId: null }, 'b-bank');
    await deleteCancelledBooking('admin-1', 'b-cash', store as never);
    await deleteCancelledBooking('admin-1', 'b-bank', store as never);
    expect(store.peek('bookings', 'b-cash')).toBeUndefined();
    expect(store.peek('bookings', 'b-bank')).toBeUndefined();
  });

  it('отменённая неоплаченная онлайн-бронь (сессия истекла) удаляется', async () => {
    seed({ status: 'cancelled', paymentStatus: 'expired', stripePaymentIntentId: null });
    await deleteCancelledBooking('admin-1', B, store as never);
    expect(store.peek('bookings', B)).toBeUndefined();
  });

  it('активную бронь по-прежнему нельзя удалить', async () => {
    seed();
    expect((await refusal(deleteCancelledBooking('admin-1', B, store as never))).reason).toBe('not_cancelled');
  });
});

// ── Ручные действия ─────────────────────────────────────────────────────────

describe('онлайн-оплату нельзя переключить вручную', () => {
  it('отмена оплаченной онлайн → refund_required, место не освобождается', async () => {
    seed();
    const err = await refusal(cancelBookingByAdmin('admin-1', B));
    expect(err.reason).toBe('refund_required');
    expect(booking().status).toBe('confirmed');
    expect((await readShowAvailability())[SHOW]!.sold).toBe(2);
  });

  it('«Не оплачено» для онлайн → online_payment', async () => {
    seed();
    expect((await refusal(markUnpaidByAdmin(B))).reason).toBe('online_payment');
    expect(booking().paymentStatus).toBe('paid');
  });

  it('«Оплачено» (по коду билета) для ожидающей онлайн → online_payment', async () => {
    seed({ status: 'pending', paymentStatus: 'awaiting_online', stripePaymentIntentId: null });
    const err = await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'ABCD-2345', action: 'mark_paid' }));
    expect(err.reason).toBe('online_payment');
  });

  it('наличные: «Не оплачено» работает как раньше', async () => {
    seed({ paymentMethod: 'on_site', stripePaymentIntentId: null });
    await markUnpaidByAdmin(B);
    expect(booking().paymentStatus).toBe('not_paid');
  });
});

// ── Ручной возврат через Stripe Dashboard ───────────────────────────────────

describe('ручной возврат: webhook отражает состояние', () => {
  it('pending → бронь отменена, места освобождены, удалить нельзя', async () => {
    seed();
    await sync(refund());
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'pending' } });
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(adminPaymentState(booking() as never).label).toBe('Возврат обрабатывается');
    expect(financialHold(booking() as never)).toBe('refund_pending');
  });

  it('succeeded → refunded, билет недействителен, продолжить оплату нельзя', async () => {
    seed();
    await sync(refund({ status: 'succeeded' }));
    const b = booking();
    expect(b).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAt: '<ts>' });
    expect(adminPaymentState(b as never).label).toBe('Возвращено');
    expect(isScannableTicket(b as never)).toBe(false);
    expect(onlineBookingState(b as never)).toBe('refunded');
    expect(canResumeCheckout(b as never)).toBe(false);
    expect(financialHold(b as never)).toBeNull();
  });

  it('повтор события — идемпотентно', async () => {
    seed();
    await sync(refund({ status: 'succeeded' }));
    const before = booking();
    const again = await sync(refund({ status: 'succeeded' }));
    expect(again).toMatchObject({ outcome: 'ignored', reason: 'duplicate' });
    expect(booking()).toEqual(before);
  });

  it('succeeded → failed: деньги у театра, paid + refund_failed, бронь НЕ воскрешена', async () => {
    seed();
    await sync(refund({ status: 'succeeded' }));
    await sync(refund({ status: 'failed' }));
    const b = booking();
    expect(b).toMatchObject({
      status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'refund_failed',
      refund: { status: 'failed' }, refundedAt: '<delete>',
    });
    expect((b.paymentIssueDetails as { afterSucceeded?: boolean }).afterSucceeded).toBe(true);
    // Место не вернулось автоматически, билета нет.
    expect((await readShowAvailability())[SHOW]!.sold).toBe(0);
    expect(isScannableTicket(b as never)).toBe(false);
    expect(adminPaymentState(b as never)).toEqual({ label: 'Возврат не выполнен', tone: 'issue' });
    expect(financialHold(b as never)).toBe('refund_failed');
  });

  it('возврат не прошёл сразу (без отмены) — бронь оплачена и действует, проблема видна', async () => {
    seed();
    await sync(refund({ status: 'failed' }));
    expect(booking()).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', paymentIssue: 'refund_failed' });
    expect(isScannableTicket(booking() as never)).toBe(true);
  });

  it('повторный успешный возврат закрывает проблему, след остаётся', async () => {
    seed();
    await sync(refund({ status: 'succeeded' }));
    await sync(refund({ status: 'failed' }));
    await sync(refund({ id: 're_test_2', status: 'succeeded' }));
    expect(booking()).toMatchObject({
      paymentStatus: 'refunded', paymentIssue: '<delete>',
      paymentIssueResolved: { issue: 'refund_failed', via: 'refund', refundId: 're_test_2' },
    });
  });

  it('возврат по оплате после отмены закрывает paid_after_cancel', async () => {
    seed({ status: 'cancelled', paymentIssue: 'paid_after_cancel' });
    await sync(refund({ status: 'succeeded' }));
    expect(booking()).toMatchObject({ paymentStatus: 'refunded', paymentIssue: '<delete>' });
  });
});

// ── Проход по билету ────────────────────────────────────────────────────────

describe('возвращённый билет не проходит', () => {
  it('check-in отказывает, сканер объясняет причину', async () => {
    seed({ status: 'cancelled', paymentStatus: 'refunded' });
    const err = await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'ABCD-2345', action: 'mark_attended', showId: SHOW }));
    expect(err.reason).toBe('cancelled');
    const card = projectSource('src/pages/TicketCheckPage/TicketResultCard.tsx');
    expect(card).toContain("if (b.paymentStatus === 'refunded')           return 'Оплата возвращена — билет недействителен';");
  });

  it('возврат обрабатывается — тоже не проходит', async () => {
    seed({ status: 'cancelled', refund: { id: 're', status: 'pending', amount: 45 } });
    const err = await refusal(checkinTicket({ adminUid: 'admin-1', ticketCode: 'ABCD-2345', action: 'mark_attended', showId: SHOW }));
    expect(err.reason).toBe('cancelled');
  });
});

// ── Сверка возвратов в cron ─────────────────────────────────────────────────

describe('cron: сверка возвратов со Stripe', () => {
  it('потерянный refund.created: возврат из списка Stripe применяется к брони', async () => {
    seed();
    stripeRefunds = [refund({ status: 'succeeded' })];
    const r = await reconcileRefunds(Date.now());
    expect(r).toMatchObject({ checked: 1, recorded: 1, errors: 0 });
    expect(booking()).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    // Один список за ограниченное окно, а не опрос каждой брони.
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]).toMatchObject({ created: { gte: expect.any(Number) }, limit: 100 });
  });

  it('зависший pending вне окна списка — проверяется точечно по id', async () => {
    seed({ status: 'cancelled', refund: { id: 're_old', status: 'pending', amount: 45 } });
    // Возврат старше окна: в списке «недавних» его нет, retrieve по id знает итог.
    stripeRefunds = [refund({ id: 're_old', status: 'succeeded' })];
    recentRefunds = [];
    const r = await reconcileRefunds(Date.now());
    expect(r.recorded).toBe(1);
    expect(booking()).toMatchObject({ paymentStatus: 'refunded', refund: { id: 're_old', status: 'succeeded' } });
  });

  it('повторный прогон ничего не меняет (идемпотентно)', async () => {
    seed();
    stripeRefunds = [refund({ status: 'succeeded' })];
    await reconcileRefunds(Date.now());
    const before = booking();
    const r = await reconcileRefunds(Date.now());
    expect(r.recorded).toBe(0);
    expect(booking()).toEqual(before);
  });

  it('возвраты чужих платежей брони не трогают', async () => {
    seed();
    stripeRefunds = [refund({ payment_intent: 'pi_other', status: 'succeeded' })];
    await reconcileRefunds(Date.now());
    expect(booking()).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
  });

  it('Stripe не настроен — сверка не выполняется', async () => {
    stripeConfigured = false;
    expect(await reconcileRefunds(Date.now())).toMatchObject({ disabled: true, checked: 0 });
  });

  it('cron вызывает сверку возвратов', () => {
    const cron = projectSource('api/expire-bookings.ts');
    expect(cron).toContain('await reconcileRefunds()');
  });
});

// ── Безопасность ────────────────────────────────────────────────────────────

describe('возвраты инициирует только человек в Stripe Dashboard', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(e => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(e) ? [full] : [];
  });
  const ROOT = resolve(__dirname, '../..');
  const code = ['src', 'server', 'api', 'shared'].flatMap(d => walk(join(ROOT, d)))
    .map(f => readFileSync(f, 'utf8')).join('\n');

  it('в коде нет refunds.create и cancel_refund', () => {
    expect(code).not.toMatch(/refunds\.create|cancel_refund/);
  });

  it('браузер не обращается к Stripe API', () => {
    const src = walk(join(ROOT, 'src')).map(f => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/api\.stripe\.com|refunds\.|from 'stripe'/);
  });
});
