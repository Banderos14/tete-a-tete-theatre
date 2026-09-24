// Stripe SDK — только сервер.
//
// Клиент создаётся лениво, при первом обращении: модуль можно импортировать
// при сборке и в тестах без ключа. Версия API закреплена самим пакетом stripe
// (package-lock.json), поэтому apiVersion здесь не передаётся.
//
// Правила окружений (fail closed):
//   • live-ключ (sk_live_/rk_live_) вне production не принимается вовсе;
//   • онлайн-оплату принимает только сервер с ONLINE_PAYMENT_ENABLED=true и ключом.
//     Клиентский флаг VITE_ONLINE_PAYMENT_ENABLED лишь показывает кнопку —
//     его обходит любой curl, поэтому решает серверный.

import Stripe from 'stripe';
import { ApiError } from '../shared/errors.js';
import { isProductionRuntime } from '../shared/runtimeEnv.js';

export type StripeKeyMode = 'test' | 'live';

/** Режим ключа по префиксу; null — это не секретный ключ Stripe. */
export function stripeKeyMode(key: string | undefined): StripeKeyMode | null {
  const value = (key ?? '').trim();
  if (/^(sk|rk)_test_/.test(value)) return 'test';
  if (/^(sk|rk)_live_/.test(value)) return 'live';
  return null;
}

/**
 * Секретный ключ, пригодный для этого окружения, либо null.
 * Бросает, если вне production задан live-ключ: это ошибка конфигурации,
 * а не «Stripe не настроен», и молча работать дальше нельзя.
 */
export function resolveStripeSecretKey(): string | null {
  const key  = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  const mode = stripeKeyMode(key);
  if (!mode) return null;
  if (mode === 'live' && !isProductionRuntime()) {
    throw new Error('Stripe live key is not allowed outside production (VERCEL_ENV !== production)');
  }
  return key;
}

/** Ожидаемый livemode событий Stripe для текущего ключа. */
export function expectedLivemode(): boolean {
  return stripeKeyMode(process.env.STRIPE_SECRET_KEY) === 'live';
}

/** Принимает ли сервер новые онлайн-оплаты. */
export function isOnlinePaymentEnabled(): boolean {
  if ((process.env.ONLINE_PAYMENT_ENABLED ?? '').trim() !== 'true') return false;
  try {
    return resolveStripeSecretKey() !== null;
  } catch {
    return false;
  }
}

let client: Stripe | null = null;
let clientKey = '';

/**
 * Клиент Stripe. 503, если ключ не задан: webhook и сверка тогда недоступны,
 * а онлайн-оплата не предлагается. Работает независимо от
 * ONLINE_PAYMENT_ENABLED: уже принятые платежи обрабатываются и после
 * выключения приёма новых.
 */
export function getStripe(): Stripe {
  const key = resolveStripeSecretKey();
  if (!key) throw new ApiError(503, 'Online payment is not configured', 'online_payment_unavailable');
  if (!client || clientKey !== key) {
    client    = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
    clientKey = key;
  }
  return client;
}
