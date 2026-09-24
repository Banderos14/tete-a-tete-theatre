// Интерфейс онлайн-оплаты: форма брони, возврат со Stripe, кабинет.
//
// Юнит-тесты проекта работают без DOM (environment: node), поэтому правила
// экрана вынесены в src/utils/onlinePayment.ts и проверяются поведением, а
// то, что компоненты этими правилами пользуются, — по исходникам.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectSource, screenSource } from '../helpers/serverSource.js';
import {
  isOnlinePaymentUiEnabled, paymentMethodsFor, checkoutRedirectUrl, redirectToCheckout,
  checkoutErrorKey, needsFreshBookingAttempt, onlineBookingState, canResumeCheckout,
  isOnlineMoneyNotice, getCheckoutReturnFromLocation, clearCheckoutParams, checkoutReturnView,
  startCheckoutWait, holdUntilMs, formatHoldTime, CHECKOUT_SYNC_DELAYS_MS, CHECKOUT_WAIT_TIMEOUT_MS,
} from '../../src/utils/onlinePayment';
import { getStubVariant } from '../../src/utils/ticketStub';
import { ticketPdfStatus } from '../../src/services/ticketPdfService';
import { isScannableTicket } from '../../shared/domain/bookingRules';
import type { Booking } from '../../src/types/booking';

type B = Pick<Booking, 'paymentMethod' | 'paymentStatus' | 'status'> & Partial<Booking>;
const online = (patch: Partial<Booking> = {}): B =>
  ({ paymentMethod: 'online', paymentStatus: 'awaiting_online', status: 'pending', ...patch });

function loc(url: string): Location {
  const u = new URL(url);
  return { search: u.search, hash: u.hash, pathname: u.pathname } as Location;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('флаг: «Оплатить онлайн» только при VITE_ONLINE_PAYMENT_ENABLED=true', () => {
  it('флаг выключен или отсутствует — онлайн-оплаты нет', () => {
    for (const v of [undefined, '', 'false', 'TRUE ', '1', true]) {
      expect(isOnlinePaymentUiEnabled(v), String(v)).toBe(false);
    }
    expect(paymentMethodsFor(false)).toEqual(['on_site', 'bank_transfer']);
  });

  it('флаг true — онлайн третьим способом, прежние на месте', () => {
    expect(isOnlinePaymentUiEnabled('true')).toBe(true);
    expect(paymentMethodsFor(true)).toEqual(['on_site', 'bank_transfer', 'online']);
  });

  it('без переменной окружения (юнит-тесты не читают .env) — выключено', () => {
    expect(isOnlinePaymentUiEnabled()).toBe(false);
  });

  it('форма строит карточки из списка способов, модалка передаёт список по флагу', () => {
    const step  = projectSource('src/components/ui/BookingModal/BookingFormStep.tsx');
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(step).toContain('paymentMethods.map(pm =>');
    expect(step).toContain('aria-pressed={active}');
    expect(modal).toContain('paymentMethodsFor(isOnlinePaymentUiEnabled())');
    expect(modal).toContain('paymentMethods={paymentMethods}');
  });
});

describe('отправка онлайн-брони', () => {
  const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
  const submit = modal.slice(modal.indexOf('async function handleSubmit'), modal.indexOf('function copyToClipboard'));

  it('на сервер уходит выбранный paymentMethod — в том числе online', () => {
    expect(submit).toContain('paymentMethod: payment,');
    expect(submit).toContain('idempotencyKeyRef.current');
  });

  it('онлайн: переход на Checkout раньше экрана «бронь принята»', () => {
    const onlineBranch = submit.indexOf("if (payment === 'online') {");
    expect(onlineBranch).toBeGreaterThan(-1);
    expect(onlineBranch).toBeLessThan(submit.indexOf("setStep('success')"));
    const branch = submit.slice(onlineBranch, submit.indexOf("setStep('success')"));
    expect(branch).toContain('redirectToCheckout(url)');
    expect(branch).not.toContain("setStep('success')");
  });

  it('двойной клик: отправка отсекается и во время перехода на Stripe', () => {
    expect(submit).toContain('if (submitLoading) return;');
    expect(submit).toContain('if (redirecting) return;');
  });

  it('checkoutUrl — переход; нет ссылки или не https — перехода нет', () => {
    expect(checkoutRedirectUrl({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
      .toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(checkoutRedirectUrl({})).toBeNull();
    expect(checkoutRedirectUrl(null)).toBeNull();
    expect(checkoutRedirectUrl({ checkoutUrl: 'http://checkout.stripe.com/x' })).toBeNull();
    expect(checkoutRedirectUrl({ checkoutUrl: 'javascript:alert(1)' })).toBeNull();
    expect(checkoutRedirectUrl({ checkoutUrl: 'not a url' })).toBeNull();
  });

  it('переход выполняется через location.assign', () => {
    const assign = vi.fn();
    redirectToCheckout('https://checkout.stripe.com/c/pay/cs_test_1', assign);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('ошибки онлайн-оплаты — понятный текст, без «оплачено»', () => {
    expect(checkoutErrorKey('payment_unavailable')).toBe('checkoutError');
    expect(checkoutErrorKey('checkout_in_progress')).toBe('checkoutError');
    expect(checkoutErrorKey(undefined)).toBe('checkoutError');
    expect(checkoutErrorKey('online_payment_unavailable')).toBe('onlineUnavailable');
    expect(checkoutErrorKey('checkout_expired')).toBe('checkoutExpired');
    expect(submit).toContain('t.payment[checkoutErrorKey(apiErr?.reason)]');
  });

  it('после мёртвой брони — новый ключ идемпотентности, иначе повтор вернул бы её же', () => {
    expect(needsFreshBookingAttempt('payment_unavailable')).toBe(true);
    expect(needsFreshBookingAttempt('checkout_expired')).toBe(true);
    // Сессия ещё создаётся — повтор с тем же ключом вернёт ту же бронь.
    expect(needsFreshBookingAttempt('checkout_in_progress')).toBe(false);
    expect(submit).toContain('if (needsFreshBookingAttempt(apiErr?.reason)) idempotencyKeyRef.current = newIdempotencyKey();');
  });

  it('ответ без ссылки не создаёт вторую бронь: ключ сохраняется', () => {
    const noUrl = submit.slice(submit.indexOf('if (url) {'), submit.indexOf('} catch (err)'));
    expect(noUrl).toContain("result.checkoutState === 'processing'");
    expect(noUrl).not.toContain('idempotencyKeyRef.current = newIdempotencyKey()');
  });

  it('«Назад» из Stripe (bfcache) не отправляет форму заново, а ведёт в «Мои билеты»', () => {
    expect(modal).toContain("window.addEventListener('pageshow', onPageShow)");
    expect(modal).toMatch(/if \(!e\.persisted \|\| !redirectingRef\.current\) return;[\s\S]{0,120}onOpenTickets\?\.\(\)/);
  });
});

describe('состояние онлайн-брони', () => {
  it.each([
    [online(), 'awaiting'],
    [online({ paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: 'pi_1' }), 'paid'],
    [online({ paymentStatus: 'expired', status: 'cancelled' }), 'expired'],
    [online({ status: 'cancelled' }), 'cancelled'],
    [online({ status: 'cancelled', paymentStatus: 'paid', refund: { id: 're_1', status: 'pending', amount: 45, updatedAtMs: 1 } }), 'refund_pending'],
    [online({ status: 'cancelled', paymentStatus: 'refunded', refund: { id: 're_1', status: 'succeeded', amount: 45, updatedAtMs: 1 } }), 'refunded'],
    [online({ status: 'cancelled', paymentStatus: 'paid', refund: { id: 're_1', status: 'failed', amount: 45, updatedAtMs: 1 } }), 'issue'],
    [online({ status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'paid_after_cancel' }), 'issue'],
  ] as const)('%# → %s', (b, state) => {
    expect(onlineBookingState(b)).toBe(state);
  });

  it('старые брони без новых полей — не онлайн, интерфейс их не трогает', () => {
    const legacy = { paymentMethod: 'on_site', paymentStatus: 'not_paid', status: 'pending' } as B;
    expect(onlineBookingState(legacy)).toBeNull();
    expect(canResumeCheckout(legacy)).toBe(false);
    expect(isOnlineMoneyNotice(legacy)).toBe(false);
    expect(getStubVariant(legacy as Booking)).toBe('amber');
  });

  it('«Продолжить оплату» — только для ожидающей онлайн-брони', () => {
    expect(canResumeCheckout(online())).toBe(true);
    expect(canResumeCheckout(online({ status: 'cancelled' }))).toBe(false);
    expect(canResumeCheckout(online({ paymentStatus: 'expired', status: 'cancelled' }))).toBe(false);
    expect(canResumeCheckout(online({ paymentStatus: 'paid', status: 'confirmed' }))).toBe(false);
    expect(canResumeCheckout(online({ paymentStatus: 'refunded', status: 'cancelled' }))).toBe(false);
  });

  it('до оплаты — ни QR, ни PDF-статуса; корешок янтарный', () => {
    const b = online() as Booking;
    expect(isScannableTicket(b)).toBe(false);
    expect(ticketPdfStatus(b)).toBeNull();
    expect(getStubVariant(b)).toBe('amber');
  });

  it('оплаченная онлайн-бронь — обычный билет с QR, как раньше', () => {
    const b = online({ paymentStatus: 'paid', status: 'confirmed' }) as Booking;
    expect(isScannableTicket(b)).toBe(true);
    expect(ticketPdfStatus(b)).toMatchObject({ tone: 'paid' });
    expect(getStubVariant(b)).toBe('burgundy');
  });

  it('возвращённая / отменённая — не билет, корешок серый', () => {
    const refunded = online({ paymentStatus: 'refunded', status: 'cancelled' }) as Booking;
    expect(isScannableTicket(refunded)).toBe(false);
    expect(getStubVariant(refunded)).toBe('grey');
  });

  it('в «Моих билетах» остаётся отменённая онлайн-бронь с возвратом или проблемой оплаты', () => {
    expect(isOnlineMoneyNotice(online({ status: 'cancelled', paymentStatus: 'refunded' }))).toBe(true);
    expect(isOnlineMoneyNotice(online({ status: 'cancelled', paymentStatus: 'paid', paymentIssue: 'paid_after_cancel' }))).toBe(true);
    expect(isOnlineMoneyNotice(online({ status: 'cancelled' }))).toBe(false);
    expect(isOnlineMoneyNotice(online({ paymentStatus: 'expired', status: 'cancelled' }))).toBe(false);
    const hook = projectSource('src/components/ui/ProfileDrawer/useProfileBookings.ts');
    expect(hook).toContain('isOnlineMoneyNotice(b)');
  });

  it('срок холда — из брони (фактический expires_at сессии)', () => {
    expect(holdUntilMs({ paymentExpiresAt: { seconds: 1_800 } as never })).toBe(1_800_000);
    expect(holdUntilMs({ paymentExpiresAt: { toMillis: () => 42 } as never })).toBe(42);
    expect(holdUntilMs({})).toBeNull();
    expect(formatHoldTime(null, 'RU')).toBeNull();
    expect(formatHoldTime(Date.UTC(2026, 8, 20, 10, 5), 'FR')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('кабинет: карточка онлайн-брони', () => {
  const card = projectSource('src/components/ui/ProfileDrawer/BookingCard.tsx');

  it('ожидающая оплаты: «Продолжить оплату» через resume_checkout, без QR и без кода', () => {
    expect(card).toContain('{canResumeCheckout(b) && (');
    expect(card).toContain('resumeCheckoutForCurrentUser(b.id)');
    expect(card).toContain('redirectToCheckout(url)');
    expect(card).toContain('{b.ticketCode && !isAwaitingOnline && (');
    // QR-блок карточки — по-прежнему только для перевода.
    expect(card).toMatch(/isAwaitingTransfer && !isCancelled && b\.ticketCode[\s\S]{0,900}<TicketQrPanel/);
  });

  it('истёкшая сессия при «Продолжить» — понятный текст, а не общая ошибка', () => {
    expect(card).toMatch(/reason === 'checkout_expired'\s*\n?\s*\? t\.payment\.checkoutExpired/);
  });

  it('штамп и тексты берутся из словаря', () => {
    const stamp = projectSource('src/components/ui/TicketCard/TicketCard.tsx');
    expect(stamp).toContain('t.payment.stampAwaiting');
    expect(stamp).toContain('t.payment.stampRefund');
    expect(card).toContain('t.payment.awaitingNote(time)');
    expect(card).toContain('t.payment.refundPending');
  });
});

describe('возврат со Stripe', () => {
  it('разбирает ?checkout=…&booking=… и в query, и после решётки', () => {
    expect(getCheckoutReturnFromLocation(loc('https://s.test/?checkout=success&booking=abc123')))
      .toEqual({ kind: 'success', bookingId: 'abc123' });
    expect(getCheckoutReturnFromLocation(loc('https://s.test/#/?checkout=cancelled&booking=abc123')))
      .toEqual({ kind: 'cancelled', bookingId: 'abc123' });
  });

  it('мусорные параметры игнорируются', () => {
    expect(getCheckoutReturnFromLocation(loc('https://s.test/?checkout=paid&booking=abc'))).toBeNull();
    expect(getCheckoutReturnFromLocation(loc('https://s.test/?checkout=success&booking=a/b'))).toBeNull();
    expect(getCheckoutReturnFromLocation(loc('https://s.test/?checkout=success'))).toBeNull();
    expect(getCheckoutReturnFromLocation(loc('https://s.test/?success=true'))).toBeNull();
  });

  it('параметры убираются из адреса, остальные сохраняются', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/', search: '?checkout=success&booking=abc&show=nulin', hash: '#/' },
      history: { replaceState },
    });
    clearCheckoutParams();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?show=nulin#/');
  });

  const wait = { loaded: true, timedOut: false };

  it('success-адрес сам по себе НЕ делает бронь оплаченной', () => {
    expect(checkoutReturnView('success', online(), wait)).toBe('checking');
    expect(checkoutReturnView('success', online(), { ...wait, timedOut: true })).toBe('processing');
    for (const opts of [wait, { ...wait, timedOut: true }, { ...wait, serverState: 'processing' as const }]) {
      expect(checkoutReturnView('success', online(), opts)).not.toBe('paid');
    }
  });

  it('оплачено — только когда бронь из Firestore стала paid', () => {
    expect(checkoutReturnView('success', online({ paymentStatus: 'paid', status: 'confirmed' }), wait)).toBe('paid');
  });

  it('сервер сверился: сессия открыта — «оплата не завершена», истекла — бронь не действует', () => {
    expect(checkoutReturnView('success', online(), { ...wait, serverState: 'open' })).toBe('not_completed');
    expect(checkoutReturnView('success', online(), { ...wait, serverState: 'expired' })).toBe('inactive');
  });

  it('cancel-возврат: бронь не отменяется, предлагается продолжить оплату', () => {
    expect(checkoutReturnView('cancelled', online(), wait)).toBe('not_completed');
    expect(checkoutReturnView('cancelled', online({ paymentStatus: 'expired', status: 'cancelled' }), wait)).toBe('inactive');
    const modalSrc = screenSource('src/components/ui/CheckoutReturnModal');
    expect(modalSrc).not.toMatch(/cancelBookingByUser|\/api\/cancel-booking/);
  });

  it('пока брони нет — «проверяем»; не нашлась — «не найдена»; проблема — «нужна проверка»', () => {
    expect(checkoutReturnView('success', undefined, { loaded: false, timedOut: false })).toBe('checking');
    expect(checkoutReturnView('success', undefined, wait)).toBe('not_found');
    expect(checkoutReturnView('success', online({ paymentIssue: 'amount_mismatch' }), wait)).toBe('issue');
  });

  it('экран возврата: подписка на брони, ограниченное ожидание со сбросом, без записи в Firestore', () => {
    const src = screenSource('src/components/ui/CheckoutReturnModal');
    expect(src).toContain('subscribeToUserBookings(user.uid');
    expect(src).toMatch(/return startCheckoutWait\(\{/);
    expect(src).not.toMatch(/updateDoc|setDoc|runTransaction|paymentStatus:\s*'paid'/);
    const app = projectSource('src/app/App.tsx');
    expect(app).toContain('<ErrorBoundary label="CheckoutReturnModal">');
    expect(app).toMatch(/const CheckoutReturnModal = lazy\(/);
  });
});

describe('ограниченное ожидание подтверждения', () => {
  it('несколько сверок, затем таймаут — не бесконечный опрос', async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => {});
    const onTimeout = vi.fn();
    startCheckoutWait({ sync, onTimeout });
    await vi.advanceTimersByTimeAsync(CHECKOUT_WAIT_TIMEOUT_MS + 60_000);
    expect(sync).toHaveBeenCalledTimes(CHECKOUT_SYNC_DELAYS_MS.length);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('оплата пришла после второй сверки — ожидание останавливается', async () => {
    vi.useFakeTimers();
    let paid = false;
    let stop: () => void = () => {};
    const sync = vi.fn(async () => {
      if (sync.mock.calls.length === 2) { paid = true; stop(); }
    });
    const onTimeout = vi.fn();
    stop = startCheckoutWait({ sync, onTimeout });
    await vi.advanceTimersByTimeAsync(CHECKOUT_WAIT_TIMEOUT_MS + 1_000);
    expect(paid).toBe(true);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('таймаут оставляет безопасное «обрабатывается», а не «не прошла»', () => {
    expect(checkoutReturnView('success', online(), { loaded: true, timedOut: true })).toBe('processing');
  });

  it('остановка при размонтировании снимает все таймеры', async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => {});
    const onTimeout = vi.fn();
    const stop = startCheckoutWait({ sync, onTimeout });
    stop();
    await vi.advanceTimersByTimeAsync(CHECKOUT_WAIT_TIMEOUT_MS * 2);
    expect(sync).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('сбой сверки не ломает ожидание', async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => { throw new Error('network'); });
    const onTimeout = vi.fn();
    startCheckoutWait({ sync, onTimeout });
    await vi.advanceTimersByTimeAsync(CHECKOUT_WAIT_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('безопасность интерфейса', () => {
  // Весь frontend целиком, рекурсивно.
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(e => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(e) ? [full] : [];
  });
  const files  = walk(resolve(__dirname, '../../src'));
  const allSrc = files.map(f => readFileSync(f, 'utf8')).join('\n');

  it('обход действительно видит компоненты', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(allSrc).toContain('export function BookingCard');
  });

  it('нет Stripe.js, Elements и publishable key', () => {
    expect(allSrc).not.toMatch(/loadStripe|@stripe\/|stripe-js|VITE_STRIPE|pk_(test|live)_/);
  });

  it('клиент не пишет paymentStatus paid и не считает сумму для Stripe', () => {
    expect(allSrc).not.toMatch(/paymentStatus:\s*'paid'/);
    expect(allSrc).not.toMatch(/unit_amount|amount_total/);
  });
});
