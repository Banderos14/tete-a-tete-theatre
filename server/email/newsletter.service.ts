// Рассылка анонса спектакля.
//
// Главное правило — никакой частичной отправки из-за квоты:
//   1. сервер сам собирает получателей (адреса в браузер не уходят);
//   2. рассылка берёт блокировку, чтобы два запуска не делили одну квоту;
//   3. НЕПОСРЕДСТВЕННО перед первым письмом квота пересчитывается заново:
//      между preflight в админке и отправкой могли уйти письма о бронях;
//   4. не хватает хотя бы на одно письмо — не отправляется ни одно;
//   5. если Resend всё же отклонил пачку (квота, rate limit, сбой) —
//      рассылка останавливается без повторов, результат честно пишется в отчёт.
//
// Письма уходят через Batch API: до 100 отдельных писем за запрос, у каждого
// свой единственный адресат — получатели не видят адресов друг друга.

import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import { ApiError, badRequest, conflict } from '../shared/errors.js';
import { SHOWS } from '../../shared/catalog/shows.js';
import {
  NEWSLETTER_NAME_TOKEN, RESEND_BATCH_MAX,
  type NewsletterDraft, type NewsletterPreflight, type NewsletterSendRequest,
  type NewsletterSendResult, type NewsletterStopReason,
} from '../../shared/contracts/newsletter.js';
import { MAX_HTML_LEN, MAX_SUBJECT_LEN } from './email.validation.js';
import { logEmailDeliveries } from './email.repository.js';
import { loadNewsletterRecipients, type NewsletterRecipient } from './newsletter.recipients.js';
import {
  combineUsage, decideQuota, readEmailLogUsage, readResendUsage, resolveDailyLimit, utcDayStartMs,
  type SentTodayReading,
} from './resendQuota.js';

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const MAX_TEXT_LEN     = 20_000;

/** Блокировка живёт дольше самой длинной рассылки, но не вечно — на случай падения функции. */
const LOCK_TTL_MS = 5 * 60 * 1000;
const LOCK_DOC    = 'newsletterLocks/send';

export interface ResendEmail {
  from: string; to: string; subject: string; html: string; text: string;
}

export type BatchOutcome =
  | { ok: true;  status: number; rejectedIndexes: number[] }
  | { ok: false; status: number; reason: NewsletterStopReason };

/** Всё, что рассылке нужно снаружи. Тесты подменяют это фейками — без сети и Firestore. */
export interface NewsletterDeps {
  dailyLimit: number;
  apiKey:     string | undefined;
  from:       string | undefined;
  loadRecipients: () => Promise<NewsletterRecipient[]>;
  readUsage:      () => Promise<SentTodayReading | null>;
  sendBatch:      (emails: ResendEmail[]) => Promise<BatchOutcome>;
  logDeliveries:  typeof logEmailDeliveries;
  acquireLock:    (owner: string) => Promise<boolean>;
  releaseLock:    (owner: string) => Promise<void>;
}

// ── Запрос ──────────────────────────────────────────────────────────────────

/** Ссылка на спектакль в письме: тот же deep-link, что и на сайте. */
export function showDeepLinkPath(showId: string): string {
  return `/#/?show=${encodeURIComponent(showId)}`;
}

function validateDraft(raw: unknown, showId: string, lang: string): NewsletterDraft {
  const d = (raw ?? {}) as Record<string, unknown>;
  const { subject, html, text } = d;
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX_SUBJECT_LEN) {
    throw badRequest(`Missing or invalid ${lang} subject`);
  }
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_HTML_LEN) {
    throw badRequest(`Missing or invalid ${lang} html`);
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LEN) {
    throw badRequest(`Missing or invalid ${lang} text`);
  }
  const link = showDeepLinkPath(showId);
  if (!html.includes(link) || !text.includes(link)) {
    throw badRequest(`${lang} draft must link to ${link}`, 'show_link_mismatch');
  }
  return { subject: subject.trim(), html, text };
}

export function validateNewsletterRequest(body: Record<string, unknown>): NewsletterSendRequest {
  const showId = typeof body.showId === 'string' ? body.showId.trim() : '';
  if (!showId || !Object.hasOwn(SHOWS, showId)) throw badRequest('Invalid showId');

  const drafts = (body.drafts ?? {}) as Record<string, unknown>;
  return {
    showId,
    drafts: {
      RU: validateDraft(drafts.RU, showId, 'RU'),
      FR: validateDraft(drafts.FR, showId, 'FR'),
    },
  };
}

// ── Письмо получателю ───────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Имя подставляется на место метки; в HTML — только экранированным. */
export function personalize(
  draft: NewsletterDraft, recipient: NewsletterRecipient, from: string,
): ResendEmail {
  const fill = (s: string, value: string) => s.split(NEWSLETTER_NAME_TOKEN).join(value);
  return {
    from,
    to:      recipient.email,
    subject: fill(draft.subject, recipient.name),
    html:    fill(draft.html, escapeHtml(recipient.name)),
    text:    fill(draft.text, recipient.name),
  };
}

// ── Resend ──────────────────────────────────────────────────────────────────

/** Причина отказа Resend по статусу и полю name тела ошибки. */
export function classifyResendError(status: number, body: unknown): NewsletterStopReason {
  const name = (body as { name?: unknown } | null)?.name;
  if (name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded' || name === 'rate_limit_exceeded') {
    return name;
  }
  return status === 429 ? 'rate_limit_exceeded' : 'provider_error';
}

export function createResendBatchSender(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (emails: ResendEmail[]): Promise<BatchOutcome> => {
    let res: Response;
    try {
      res = await fetchImpl(RESEND_BATCH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body:    JSON.stringify(emails),
      });
    } catch (err) {
      console.error('[newsletter] Resend batch request failed:', err);
      return { ok: false, status: 0, reason: 'provider_error' };
    }

    const body = await res.json().catch(() => null) as
      { errors?: { index?: unknown }[] } | Record<string, unknown> | null;

    if (!res.ok) return { ok: false, status: res.status, reason: classifyResendError(res.status, body) };

    // В нестрогом режиме валидации Resend возвращает отклонённые письма в errors[].
    const errors = Array.isArray((body as { errors?: unknown })?.errors)
      ? (body as { errors: { index?: unknown }[] }).errors : [];
    const rejectedIndexes = errors
      .map(e => e.index)
      .filter((i): i is number => typeof i === 'number');
    return { ok: true, status: res.status, rejectedIndexes };
  };
}

// ── Сценарии ────────────────────────────────────────────────────────────────

export async function newsletterPreflight(deps: NewsletterDeps = defaultNewsletterDeps()): Promise<NewsletterPreflight> {
  const [recipients, usage] = await Promise.all([deps.loadRecipients(), deps.readUsage()]);
  return decideQuota(recipients.length, usage, deps.dailyLimit, Boolean(deps.apiKey && deps.from));
}

export async function sendNewsletter(
  request: NewsletterSendRequest, adminUid: string, deps: NewsletterDeps = defaultNewsletterDeps(),
): Promise<NewsletterSendResult> {
  if (!deps.apiKey || !deps.from) {
    throw new ApiError(503, 'Email provider not configured', 'provider_not_configured');
  }
  const from  = deps.from;
  const owner = `${adminUid}:${randomUUID()}`;
  if (!await deps.acquireLock(owner)) {
    throw conflict('Newsletter is already being sent', 'newsletter_in_progress');
  }

  try {
    // Повторная проверка прямо перед отправкой — preflight из админки мог устареть.
    const recipients = await deps.loadRecipients();
    const preflight  = decideQuota(recipients.length, await deps.readUsage(), deps.dailyLimit);

    if (recipients.length === 0) throw conflict('No newsletter recipients', 'no_recipients', { preflight });
    if (!preflight.canSendAll) {
      console.warn('[newsletter] not started: insufficient quota', {
        required: preflight.required, remaining: preflight.remaining, source: preflight.quotaSource,
      });
      throw conflict('Insufficient Resend daily quota — newsletter was not started', 'insufficient_quota', { preflight });
    }

    return await deliver(request, recipients, from, deps);
  } finally {
    await deps.releaseLock(owner).catch(err => console.warn('[newsletter] lock release failed:', err));
  }
}

async function deliver(
  request: NewsletterSendRequest, recipients: NewsletterRecipient[], from: string, deps: NewsletterDeps,
): Promise<NewsletterSendResult> {
  const result: NewsletterSendResult = {
    sent: 0, sentRU: 0, sentFR: 0, failed: 0, notAttempted: 0, stoppedReason: null,
  };
  const log: Parameters<typeof logEmailDeliveries>[0][number][] = [];

  for (let start = 0; start < recipients.length; start += RESEND_BATCH_MAX) {
    const chunk   = recipients.slice(start, start + RESEND_BATCH_MAX);
    const outcome = await deps.sendBatch(chunk.map(r => personalize(request.drafts[r.lang], r, from)));

    if (!outcome.ok) {
      // Без повторов: повтор на квоте бесполезен, а на сбое сети рискует дублями.
      result.failed        += chunk.length;
      result.notAttempted   = recipients.length - start - chunk.length;
      result.stoppedReason  = outcome.reason;
      for (const r of chunk) log.push({ type: 'newsletter', uid: r.uid, status: 'failed', providerStatus: outcome.status });
      console.error('[newsletter] stopped: Resend rejected batch', {
        status: outcome.status, reason: outcome.reason, showId: request.showId,
        sent: result.sent, failed: result.failed, notAttempted: result.notAttempted,
      });
      break;
    }

    const rejected = new Set(outcome.rejectedIndexes);
    chunk.forEach((r, i) => {
      if (rejected.has(i)) {
        result.failed++;
        log.push({ type: 'newsletter', uid: r.uid, status: 'failed', providerStatus: outcome.status });
        return;
      }
      result.sent++;
      if (r.lang === 'FR') result.sentFR++; else result.sentRU++;
      log.push({ type: 'newsletter', uid: r.uid, status: 'sent', providerStatus: outcome.status });
    });
  }

  await deps.logDeliveries(log);
  console.log('[newsletter] finished', { showId: request.showId, ...result });
  return result;
}

// ── Реальные зависимости ────────────────────────────────────────────────────

async function acquireFirestoreLock(owner: string): Promise<boolean> {
  const db  = getFirestore(getAdminApp());
  const ref = db.doc(LOCK_DOC);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const expiresAtMs = snap.exists ? Number(snap.data()?.expiresAtMs ?? 0) : 0;
    if (expiresAtMs > Date.now()) return false;
    tx.set(ref, { owner, expiresAtMs: Date.now() + LOCK_TTL_MS });
    return true;
  });
}

async function releaseFirestoreLock(owner: string): Promise<void> {
  const db  = getFirestore(getAdminApp());
  const ref = db.doc(LOCK_DOC);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.owner === owner) tx.delete(ref);
  });
}

export function defaultNewsletterDeps(): NewsletterDeps {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM;
  return {
    dailyLimit: resolveDailyLimit(),
    apiKey,
    from,
    loadRecipients: loadNewsletterRecipients,
    readUsage: async () => {
      const dayStart = utcDayStartMs();
      const [resend, emailLog] = await Promise.all([
        apiKey ? readResendUsage(apiKey, dayStart) : Promise.resolve(null),
        readEmailLogUsage(dayStart).catch(err => {
          console.warn('[newsletter] emailLog usage read failed:', err);
          return null;
        }),
      ]);
      return combineUsage(resend, emailLog);
    },
    sendBatch: apiKey ? createResendBatchSender(apiKey) : async () => ({ ok: false, status: 0, reason: 'provider_error' }),
    logDeliveries: logEmailDeliveries,
    acquireLock:   acquireFirestoreLock,
    releaseLock:   releaseFirestoreLock,
  };
}
