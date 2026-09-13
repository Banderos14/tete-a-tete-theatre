// Дневная квота Resend: сколько писем аккаунт уже отправил за сутки.
//
// Что реально есть у Resend (проверено по официальной документации):
//   - отдельного API «тариф / квота / остаток» НЕТ;
//   - заголовок `x-resend-daily-quota` — ИЗРАСХОДОВАННАЯ дневная квота, приходит
//     только на Free-плане;
//   - GET /emails — список отправленных писем, новые первыми, до 100 за запрос;
//   - сутки квоты — календарные UTC (00:00–24:00), а не скользящие 24 часа;
//   - в квоту входят ВСЕ письма аккаунта: подтверждения броней, оплаты,
//     рассылка и даже входящие.
//
// Заголовки `ratelimit-*` описывают лимит API-запросов в секунду — к дневной
// квоте писем они отношения не имеют и здесь не читаются намеренно.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import type { NewsletterPreflight, QuotaSource } from '../../shared/contracts/newsletter.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

/** Дневной лимит Free-плана Resend. Меняется только здесь или через env. */
export const RESEND_FREE_DAILY_LIMIT = 100;

/** Единственный заголовок Resend про дневную квоту писем. */
export const DAILY_QUOTA_HEADER = 'x-resend-daily-quota';

/** Страниц GET /emails за один подсчёт: при лимите 100 писем в день хватает двух. */
const MAX_LIST_PAGES = 5;
const LIST_PAGE_SIZE = 100;

/**
 * Дневной лимит писем. Источник — серверная конфигурация, клиент его не задаёт.
 * RESEND_DAILY_LIMIT переопределяет значение при смене тарифа.
 */
export function resolveDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.RESEND_DAILY_LIMIT?.trim();
  if (!raw) return RESEND_FREE_DAILY_LIMIT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : RESEND_FREE_DAILY_LIMIT;
}

/** Начало текущих UTC-суток — именно по ним Resend сбрасывает дневную квоту. */
export function utcDayStartMs(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Израсходованная дневная квота из заголовка Resend или null, если его нет. */
export function parseDailyQuotaHeader(headers: Pick<Headers, 'get'>): number | null {
  const raw = headers.get(DAILY_QUOTA_HEADER);
  if (raw === null || raw.trim() === '') return null;
  const used = Number(raw.trim());
  return Number.isFinite(used) && used >= 0 ? Math.floor(used) : null;
}

/**
 * created_at Resend приходит как "2026-09-13 08:15:42.674981+00" — Date.parse
 * такой формат понимает не везде, поэтому приводим к ISO.
 */
export function parseResendTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const iso = raw.trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Сколько писем из страницы списка отправлено сегодня.
 * Письмо с непонятной датой считается сегодняшним: ошибиться в сторону
 * «квоты меньше» безопаснее, чем недосчитать и упереться в лимит на середине.
 * Несколько адресатов в одном письме Resend считает отдельными письмами.
 */
export function countTodayFromList(
  items: readonly { created_at?: unknown; to?: unknown }[],
  dayStartMs: number,
): { count: number; reachedYesterday: boolean } {
  let count = 0;
  let reachedYesterday = false;
  for (const item of items) {
    const at = parseResendTimestamp(item.created_at);
    if (at !== null && at < dayStartMs) { reachedYesterday = true; continue; }
    count += Array.isArray(item.to) && item.to.length > 1 ? item.to.length : 1;
  }
  return { count, reachedYesterday };
}

/** Сколько писем за сутки сайт сам отметил в emailLog как принятые Resend. */
export function countTodayFromLog(
  entries: readonly { status?: unknown; createdAtMs?: number | null }[],
  dayStartMs: number,
): number {
  return entries.filter(e =>
    e.status === 'sent' && (e.createdAtMs == null || e.createdAtMs >= dayStartMs),
  ).length;
}

export interface SentTodayReading {
  sentToday: number;
  source:    QuotaSource;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Израсходованная квота по данным Resend: заголовок, а если его нет — подсчёт
 * по списку писем. null — Resend не ответил (например, ключ только на отправку:
 * такой ключ не имеет права читать GET /emails).
 */
export async function readResendUsage(
  apiKey: string, dayStartMs: number, fetchImpl: FetchLike = fetch,
): Promise<SentTodayReading | null> {
  let listed = 0;
  let after: string | null = null;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const url = `${RESEND_EMAILS_URL}?limit=${LIST_PAGE_SIZE}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (err) {
      console.warn('[resend-quota] GET /emails failed:', err);
      return null;
    }
    if (!res.ok) {
      console.warn('[resend-quota] GET /emails responded', res.status);
      return null;
    }

    // Заголовок — собственный счётчик Resend, он учитывает и входящие письма.
    const used = parseDailyQuotaHeader(res.headers);
    if (used !== null) return { sentToday: used, source: 'resend-header' };

    const body = await res.json().catch(() => null) as
      { data?: { id?: string; created_at?: unknown; to?: unknown }[]; has_more?: boolean } | null;
    const items = Array.isArray(body?.data) ? body.data : [];
    const { count, reachedYesterday } = countTodayFromList(items, dayStartMs);
    listed += count;

    const lastId = items.at(-1)?.id;
    if (reachedYesterday || !body?.has_more || !lastId) return { sentToday: listed, source: 'resend-list' };
    after = lastId;
  }

  // Упёрлись в предел страниц: это нижняя оценка, но больше писем в день
  // на текущем тарифе не бывает.
  return { sentToday: listed, source: 'resend-list' };
}

/** Письма, которые сайт отметил в emailLog за текущие UTC-сутки. */
export async function readEmailLogUsage(dayStartMs: number): Promise<number> {
  const snap = await getFirestore(getAdminApp())
    .collection('emailLog')
    .where('createdAt', '>=', Timestamp.fromMillis(dayStartMs))
    .get();
  return countTodayFromLog(
    snap.docs.map(d => {
      const data = d.data();
      return { status: data.status, createdAtMs: data.createdAt?.toMillis?.() ?? null };
    }),
    dayStartMs,
  );
}

/**
 * Итоговая израсходованная квота. Берём максимум из доступных источников:
 * переоценка лишь откладывает рассылку, недооценка оборвала бы её на середине.
 */
export function combineUsage(
  resend: SentTodayReading | null, emailLog: number | null,
): SentTodayReading | null {
  if (!resend && emailLog === null) return null;
  if (!resend) return { sentToday: emailLog!, source: 'email-log' };
  return { sentToday: Math.max(resend.sentToday, emailLog ?? 0), source: resend.source };
}

/**
 * Решение preflight — чистая функция, её проверяют тесты.
 *
 * Отказ по умолчанию: нет данных о квоте или не настроен провайдер — отправлять
 * нельзя. Рассылка запускается, только если ВСЕ письма помещаются в остаток.
 */
export function decideQuota(
  recipients: number,
  usage: SentTodayReading | null,
  dailyLimit: number,
  providerConfigured = true,
): NewsletterPreflight {
  const remaining = usage ? Math.max(0, dailyLimit - usage.sentToday) : 0;
  return {
    recipients,
    sentToday:   usage?.sentToday ?? 0,
    dailyLimit,
    remaining,
    required:    recipients,
    canSendAll:  providerConfigured && usage !== null && recipients > 0 && recipients <= remaining,
    quotaSource: usage?.source ?? null,
    providerConfigured,
    estimated:   true,
  };
}
