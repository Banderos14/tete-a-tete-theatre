// Онлайн-оплата (Stripe Hosted Checkout) — логика интерфейса без React и сети.
//
// Здесь только ОТОБРАЖЕНИЕ состояния, которое пишет сервер. Клиент ничего не
// подтверждает: оплату ставит webhook Stripe → сервер → Firestore, и экран
// узнаёт о ней из той же брони (подписка onSnapshot). Возврат на success_url —
// не доказательство оплаты, а лишь повод показать «проверяем оплату».
//
// Вынесено из компонентов, чтобы правила экрана проверялись юнит-тестами.

import type { Booking, PaymentMethod } from '../types/booking';
import { getQueryParam } from './showUrl';

// ── Флаг интерфейса ─────────────────────────────────────────────────────────

/**
 * Показывать ли «Оплатить онлайн». Это только кнопка: принимает ли сервер
 * онлайн-оплату, решает серверный ONLINE_PAYMENT_ENABLED.
 */
export function isOnlinePaymentUiEnabled(
  flag: unknown = import.meta.env.VITE_ONLINE_PAYMENT_ENABLED,
): boolean {
  return typeof flag === 'string' && flag.trim() === 'true';
}

/** Способы оплаты формы брони в порядке показа. Онлайн — первым, как рекомендуемый. */
export function paymentMethodsFor(onlineEnabled: boolean): PaymentMethod[] {
  return onlineEnabled ? ['online', 'on_site', 'bank_transfer'] : ['on_site', 'bank_transfer'];
}

/** Способ, отмеченный в форме как рекомендуемый. */
export const RECOMMENDED_PAYMENT_METHOD: PaymentMethod = 'online';

/**
 * Способ, выбранный при открытии формы: онлайн, если он показан, иначе —
 * прежний безопасный «на месте». Выбор зрителя форма потом не трогает:
 * значение подставляется только при открытии модалки для спектакля.
 */
export function defaultPaymentMethod(onlineEnabled: boolean): PaymentMethod {
  return onlineEnabled ? 'online' : 'on_site';
}

// ── Переход на Stripe Checkout ──────────────────────────────────────────────

/**
 * Адрес Checkout из ответа сервера. Сами ссылки клиент не строит и не хранит:
 * берётся только то, что вернул сервер, и только https.
 */
export function checkoutRedirectUrl(res: { checkoutUrl?: unknown } | null | undefined): string | null {
  const raw = res?.checkoutUrl;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

/** Переход на страницу оплаты Stripe. assign — чтобы «Назад» вернул на сайт. */
export function redirectToCheckout(url: string, assign: (url: string) => void = u => window.location.assign(u)): void {
  assign(url);
}

/** Причины отказа сервера, связанные с онлайн-оплатой, → ключ текста ошибки. */
export type CheckoutErrorKey = 'onlineUnavailable' | 'checkoutExpired' | 'checkoutError';

export function checkoutErrorKey(reason: string | undefined): CheckoutErrorKey {
  if (reason === 'online_payment_unavailable') return 'onlineUnavailable';
  if (reason === 'checkout_expired')           return 'checkoutExpired';
  return 'checkoutError';
}

/**
 * Нужен ли новый ключ идемпотентности после ошибки онлайн-оплаты. Сервер уже
 * аннулировал бронь (сессия не создалась или истекла): повтор со старым
 * ключом вернул бы ту же мёртвую бронь.
 */
export function needsFreshBookingAttempt(reason: string | undefined): boolean {
  return reason === 'payment_unavailable' || reason === 'checkout_expired';
}

// ── Состояние онлайн-брони ──────────────────────────────────────────────────

export type OnlineBookingState =
  | 'awaiting'        // ждём оплату в Stripe: места удержаны, билета нет
  | 'paid'            // оплата подтверждена webhook'ом
  | 'refund_pending'  // бронь отменена, деньги возвращаются
  | 'refunded'        // деньги возвращены
  | 'issue'           // деньги пришли, но нужна проверка театра
  | 'expired'         // время оплаты истекло
  | 'cancelled';      // отменена

type OnlineFields = Pick<Booking, 'paymentMethod' | 'paymentStatus' | 'status'>
  & Partial<Pick<Booking, 'refund' | 'paymentIssue'>>;

/** Состояние онлайн-брони для экрана; null — это не онлайн-оплата. */
export function onlineBookingState(b: OnlineFields): OnlineBookingState | null {
  if (b.paymentMethod !== 'online') return null;
  if (b.paymentStatus === 'refunded')   return 'refunded';
  if (b.refund?.status === 'pending')   return 'refund_pending';
  if (b.refund?.status === 'failed')    return 'issue';
  if (b.paymentIssue)                   return 'issue';
  if (b.paymentStatus === 'paid')       return 'paid';
  if (b.paymentStatus === 'expired')    return 'expired';
  if (b.status === 'cancelled')         return 'cancelled';
  if (b.paymentStatus === 'awaiting_online') return 'awaiting';
  return null;
}

/** Можно ли вернуться к оплате: бронь ждёт онлайн-оплату и не отменена. Срок проверит сервер. */
export function canResumeCheckout(b: OnlineFields): boolean {
  return onlineBookingState(b) === 'awaiting';
}

/**
 * Показывать ли в «Моих билетах» отменённую онлайн-бронь: зрителю важно
 * видеть, что деньги возвращаются или что оплату проверяет театр.
 */
export function isOnlineMoneyNotice(b: OnlineFields): boolean {
  const s = onlineBookingState(b);
  return b.status === 'cancelled' && (s === 'refund_pending' || s === 'refunded' || s === 'issue');
}

/** Время в формате ЧЧ:ММ по часам зрителя; null — срока нет. */
export function formatHoldTime(ms: number | null, lang: 'RU' | 'FR'): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString(lang === 'FR' ? 'fr-FR' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Срок удержания мест (мс UTC) из брони — фактический expires_at сессии Stripe. */
export function holdUntilMs(b: Pick<Booking, 'paymentExpiresAt'>): number | null {
  const ts = b.paymentExpiresAt as unknown as { toMillis?: () => number; seconds?: number } | undefined;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

// ── Возврат со Stripe ───────────────────────────────────────────────────────

export type CheckoutReturnKind = 'success' | 'cancelled';
export interface CheckoutReturn { kind: CheckoutReturnKind; bookingId: string }

const BOOKING_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CHECKOUT_PARAMS = ['checkout', 'booking'] as const;

/**
 * Параметры возврата, которые строит сервер: ?checkout=success|cancelled&booking=<id>.
 * Ничего не подтверждают — только говорят, какую бронь показать.
 */
export function getCheckoutReturnFromLocation(location: Location = window.location): CheckoutReturn | null {
  const kind = getQueryParam('checkout', location);
  const bookingId = getQueryParam('booking', location) ?? '';
  if (kind !== 'success' && kind !== 'cancelled') return null;
  if (!BOOKING_ID_RE.test(bookingId)) return null;
  return { kind, bookingId };
}

/** Убрать параметры возврата из адреса: перезагрузка не должна открывать экран снова. */
export function clearCheckoutParams(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const { pathname, search, hash } = window.location;

  const strip = (query: string): string => {
    const params = new URLSearchParams(query);
    CHECKOUT_PARAMS.forEach(p => params.delete(p));
    const rest = params.toString();
    return rest ? `?${rest}` : '';
  };

  const nextSearch = strip(search.startsWith('?') ? search.slice(1) : search);
  const q = hash.indexOf('?');
  const nextHash = q === -1 ? hash : hash.slice(0, q) + strip(hash.slice(q + 1));
  window.history.replaceState(null, '', `${pathname}${nextSearch}${nextHash}`);
}

/** Что говорит сервер о сессии при сверке (ответ resume_checkout). */
export type ServerCheckoutState = 'open' | 'paid' | 'processing' | 'expired';

export type CheckoutReturnView =
  | 'checking'       // ждём подтверждения webhook
  | 'paid'           // оплата подтверждена сервером
  | 'processing'     // подтверждения пока нет — не ошибка
  | 'not_completed'  // оплата не завершена, можно продолжить
  | 'inactive'       // бронь больше не действует
  | 'issue'          // нужна проверка театра
  | 'not_found';     // бронь не найдена у этого аккаунта

/**
 * Экран возврата со Stripe. Оплаченным он становится ТОЛЬКО по брони из
 * Firestore (paymentStatus=paid), а не по адресу success_url.
 */
export function checkoutReturnView(
  kind: CheckoutReturnKind,
  booking: OnlineFields | undefined,
  opts: { loaded: boolean; timedOut: boolean; serverState?: ServerCheckoutState | null },
): CheckoutReturnView {
  if (!opts.loaded) return 'checking';
  if (!booking)     return 'not_found';

  switch (onlineBookingState(booking)) {
    case 'paid':           return 'paid';
    case 'issue':          return 'issue';
    case 'refund_pending':
    case 'refunded':
    case 'expired':
    case 'cancelled':      return 'inactive';
    case 'awaiting':
      if (kind === 'cancelled')              return 'not_completed';
      // Сервер сверился со Stripe: сессия открыта — оплата просто не завершена.
      if (opts.serverState === 'open')       return 'not_completed';
      if (opts.serverState === 'expired')    return 'inactive';
      return opts.timedOut ? 'processing' : 'checking';
    default:               return 'not_found';
  }
}

// ── Ограниченное ожидание подтверждения ─────────────────────────────────────
//
// Бронь обновляется подпиской в реальном времени, как только webhook запишет
// оплату. Дополнительно — несколько сверок через сервер (resume_checkout сам
// спрашивает Stripe и подтверждает оплату, если webhook задержался).
//
// Первая сверка — сразу после возврата: если Stripe уже принял оплату, а
// webhook ещё в пути, сервер подтвердит её сам, и «Оплата получена» появится
// почти мгновенно. Дальше — редкий backoff: не больше 5 запросов за 20 секунд.
// Ожидание конечное: после таймаута экран честно говорит «обрабатывается».

export const CHECKOUT_SYNC_DELAYS_MS = [0, 2_500, 6_000, 12_000, 20_000] as const;
export const CHECKOUT_WAIT_TIMEOUT_MS = 30_000;

export interface CheckoutWaitOptions {
  delays?:    readonly number[];
  timeoutMs?: number;
  /** Сверка через сервер. Ошибки проглатываются — ожидание продолжается. */
  sync:       () => Promise<void>;
  onTimeout:  () => void;
  setTimer?:  (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** Запускает сверки и таймаут. Возвращает остановку — вызывать при размонтировании. */
export function startCheckoutWait(o: CheckoutWaitOptions): () => void {
  const setT   = o.setTimer   ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let stopped = false;
  const timers: unknown[] = [];

  for (const ms of o.delays ?? CHECKOUT_SYNC_DELAYS_MS) {
    timers.push(setT(() => { if (!stopped) void o.sync().catch(() => {}); }, ms));
  }
  timers.push(setT(() => { if (!stopped) o.onTimeout(); }, o.timeoutMs ?? CHECKOUT_WAIT_TIMEOUT_MS));

  return () => {
    stopped = true;
    timers.forEach(clearT);
  };
}
