import { describe, it, expect, vi } from 'vitest';
import type { Show } from '../../src/types';
import { PUBLISHED_SHOWS, SHOWS, publishedOnly } from '../../src/data/shows';
import { NEWSLETTER_SHOWS } from '../../src/pages/AdminPage/useNewsletter';
import { buildNewsletterRequest } from '../../src/services/newsletterService';
import { projectSource, screenSource } from '../helpers/serverSource.js';
import {
  RESEND_FREE_DAILY_LIMIT, combineUsage, countTodayFromList, countTodayFromLog, decideQuota,
  parseDailyQuotaHeader, readResendUsage, resolveDailyLimit, utcDayStartMs,
} from '../../server/email/resendQuota.js';
import { selectNewsletterRecipients, type NewsletterRecipient } from '../../server/email/newsletter.recipients.js';
import {
  classifyResendError, createResendBatchSender, personalize, sendNewsletter, validateNewsletterRequest,
  type BatchOutcome, type NewsletterDeps, type ResendEmail,
} from '../../server/email/newsletter.service.js';
import { NEWSLETTER_NAME_TOKEN, type NewsletterSendRequest } from '../../shared/contracts/newsletter.js';
import { ApiError } from '../../server/shared/errors.js';

// ── Спектакли в рассылке ────────────────────────────────────────────────────

describe('рассылка анонсирует ровно опубликованные спектакли', () => {
  it('dropdown рассылки === опубликованные спектакли публичного каталога', () => {
    expect(NEWSLETTER_SHOWS.map(s => s.id)).toEqual(PUBLISHED_SHOWS.map(s => s.id));
    expect(NEWSLETTER_SHOWS).toBe(PUBLISHED_SHOWS);
  });

  it('скрытые спектакли каталога в рассылку не попадают', () => {
    const hidden = SHOWS.filter(s => s.published === false).map(s => s.id);
    const ids    = NEWSLETTER_SHOWS.map(s => s.id);
    for (const id of hidden) expect(ids).not.toContain(id);
  });

  const base = SHOWS[0]!;
  const show = (id: string, published?: boolean): Show => ({ ...base, id, ...(published === undefined ? {} : { published }) });

  it('опубликованный спектакль появляется в списке автоматически', () => {
    const catalog = [show('a'), show('b', false), show('c')];
    expect(publishedOnly(catalog).map(s => s.id)).toEqual(['a', 'c']);
    // «Опубликовали» b — убрали published: false — и он в списке без правок админки.
    expect(publishedOnly([show('a'), show('b'), show('c')]).map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('неопубликованный спектакль в список не попадает', () => {
    expect(publishedOnly([show('draft', false)])).toEqual([]);
  });

  it('вкладка и хук рассылки не читают полный каталог SHOWS', () => {
    const src = projectSource('src/pages/AdminPage/NewsletterTab.tsx') + projectSource('src/pages/AdminPage/useNewsletter.ts');
    expect(src).not.toMatch(/import\s*\{[^}]*\bSHOWS\b[^}]*\}\s*from/);
    expect(src).toContain('PUBLISHED_SHOWS');
  });

  it('ссылка в письме ведёт на /#/?show=<showId>', () => {
    const romantika = PUBLISHED_SHOWS.find(s => s.id === 'romantika')!;
    const req = buildNewsletterRequest(romantika);
    for (const lang of ['RU', 'FR'] as const) {
      expect(req.drafts[lang].html).toContain('/#/?show=romantika');
      expect(req.drafts[lang].text).toContain('/#/?show=romantika');
      expect(req.drafts[lang].html).toContain(NEWSLETTER_NAME_TOKEN);
    }
    expect(() => validateNewsletterRequest(req as unknown as Record<string, unknown>)).not.toThrow();
  });

  it('сервер отклоняет черновик со ссылкой на другой спектакль', () => {
    const req = buildNewsletterRequest(PUBLISHED_SHOWS[0]!);
    const other = PUBLISHED_SHOWS[1]!;
    expect(() => validateNewsletterRequest({ ...req, showId: other.id }))
      .toThrowError(/must link to/);
  });
});

// ── Лимит и квота ───────────────────────────────────────────────────────────

describe('дневной лимит Resend', () => {
  it('задан в одном месте: Free = 100, env переопределяет, мусор игнорируется', () => {
    expect(RESEND_FREE_DAILY_LIMIT).toBe(100);
    expect(resolveDailyLimit({})).toBe(100);
    expect(resolveDailyLimit({ RESEND_DAILY_LIMIT: '1000' })).toBe(1000);
    expect(resolveDailyLimit({ RESEND_DAILY_LIMIT: '-5' })).toBe(100);
    expect(resolveDailyLimit({ RESEND_DAILY_LIMIT: 'abc' })).toBe(100);
  });

  it('число 100 не размазано по клиенту: лимит приходит только с сервера', () => {
    const client = screenSource('src/pages/AdminPage') + projectSource('src/services/newsletterService.ts');
    expect(client).not.toMatch(/\b100\b/);
    expect(client).not.toContain('RESEND_DAILY_LIMIT');
  });

  it('50 получателей, остаток 60 → можно отправить всё', () => {
    const p = decideQuota(50, { sentToday: 40, source: 'resend-header' }, 100);
    expect(p).toMatchObject({ recipients: 50, remaining: 60, required: 50, canSendAll: true });
  });

  it('50 получателей, остаток 40 → отправка запрещена', () => {
    const p = decideQuota(50, { sentToday: 60, source: 'resend-header' }, 100);
    expect(p).toMatchObject({ remaining: 40, canSendAll: false });
  });

  it('нет данных о квоте или провайдер не настроен → отказ по умолчанию', () => {
    expect(decideQuota(5, null, 100).canSendAll).toBe(false);
    expect(decideQuota(5, { sentToday: 0, source: 'email-log' }, 100, false).canSendAll).toBe(false);
    expect(decideQuota(0, { sentToday: 0, source: 'email-log' }, 100).canSendAll).toBe(false);
  });

  it('sentToday включает transactional письма, а не только рассылку', () => {
    const day = utcDayStartMs(Date.UTC(2026, 8, 13, 15));
    const today = day + 3600_000;
    const log = [
      { status: 'sent',    type: 'booking-confirmation', createdAtMs: today },
      { status: 'sent',    type: 'payment-paid',         createdAtMs: today },
      { status: 'sent',    type: 'booking-status',       createdAtMs: today },
      { status: 'sent',    type: 'newsletter',           createdAtMs: today },
      { status: 'failed',  type: 'newsletter',           createdAtMs: today },
      { status: 'skipped', type: 'booking-confirmation', createdAtMs: today },
      { status: 'sent',    type: 'booking-confirmation', createdAtMs: day - 1 },
    ];
    expect(countTodayFromLog(log, day)).toBe(4);

    // Список Resend считает все письма аккаунта, независимо от темы.
    const list = [
      { created_at: '2026-09-13 10:00:00.000000+00', to: ['a@x.fr'] },
      { created_at: '2026-09-13 09:00:00.000000+00', to: ['b@x.fr', 'c@x.fr'] },
      { created_at: '2026-09-12 23:59:59.000000+00', to: ['d@x.fr'] },
    ];
    expect(countTodayFromList(list, day)).toEqual({ count: 3, reachedYesterday: true });

    const p = decideQuota(10, combineUsage({ sentToday: 3, source: 'resend-list' }, 4), 100);
    expect(p.sentToday).toBe(4);
    expect(p.remaining).toBe(96);
  });

  it('сутки квоты — UTC, а не Europe/Paris', () => {
    // 00:30 по Парижу 13 сентября — ещё 12 сентября по UTC.
    expect(utcDayStartMs(Date.UTC(2026, 8, 12, 22, 30))).toBe(Date.UTC(2026, 8, 12));
  });

  it('rate-limit заголовки НЕ считаются дневной квотой', async () => {
    const headers = new Headers({ 'ratelimit-limit': '10', 'ratelimit-remaining': '9', 'ratelimit-reset': '1' });
    expect(parseDailyQuotaHeader(headers)).toBeNull();

    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ object: 'list', has_more: false, data: [
        { id: '1', created_at: new Date().toISOString(), to: ['a@x.fr'] },
      ] }),
      { status: 200, headers },
    ));
    const usage = await readResendUsage('key', utcDayStartMs(), fetchImpl);
    expect(usage).toEqual({ sentToday: 1, source: 'resend-list' });
    expect(decideQuota(1, usage, 100).remaining).toBe(99);
  });

  it('x-resend-daily-quota читается как израсходованная квота', async () => {
    expect(parseDailyQuotaHeader(new Headers({ 'x-resend-daily-quota': '31' }))).toBe(31);
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}', {
      status: 200, headers: { 'x-resend-daily-quota': '31', 'ratelimit-remaining': '2' },
    }));
    expect(await readResendUsage('key', utcDayStartMs(), fetchImpl)).toEqual({ sentToday: 31, source: 'resend-header' });
  });

  it('ключ без права чтения (401) → Resend недоступен, а не «0 отправлено»', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"name":"restricted_api_key"}', { status: 401 }));
    expect(await readResendUsage('key', utcDayStartMs(), fetchImpl)).toBeNull();
    expect(combineUsage(null, null)).toBeNull();
    expect(combineUsage(null, 7)).toEqual({ sentToday: 7, source: 'email-log' });
  });
});

// ── Получатели ──────────────────────────────────────────────────────────────

describe('получатели рассылки', () => {
  it('одинаковые адреса дедуплицируются (регистр и пробелы не важны)', () => {
    const users = [
      { uid: 'u1', data: { email: 'Anna@Mail.fr', notifications: true, displayName: 'Анна' } },
      { uid: 'u2', data: { email: ' anna@mail.fr ', notifications: true } },
      { uid: 'u3', data: { email: 'boris@mail.fr', notifications: true, language: 'fr' } },
    ];
    const r = selectNewsletterRecipients(users);
    expect(r.map(x => x.uid)).toEqual(['u1', 'u3']);
    expect(r[1]!.lang).toBe('FR');
  });

  it('без уведомлений, без e-mail, с невалидным e-mail и администраторы — не получатели', () => {
    const users = [
      { uid: 'off',   data: { email: 'a@mail.fr', notifications: false } },
      { uid: 'none',  data: { notifications: true } },
      { uid: 'bad',   data: { email: 'not-an-email', notifications: true } },
      { uid: 'admin', data: { email: 'b@mail.fr', notifications: true, role: 'admin' } },
      { uid: 'ok',    data: { email: 'c@mail.fr', notifications: true } },
    ];
    expect(selectNewsletterRecipients(users).map(x => x.uid)).toEqual(['ok']);
  });

  it('каждое письмо — один адресат, имя в HTML экранировано', () => {
    const draft = { subject: 'S', html: `<p>${NEWSLETTER_NAME_TOKEN}</p>`, text: `Hi ${NEWSLETTER_NAME_TOKEN}` };
    const email = personalize(draft, { uid: 'u', email: 'x@y.fr', name: '<b>Eve</b>', lang: 'RU' }, 'from@t.fr');
    expect(email.to).toBe('x@y.fr');
    expect(typeof email.to).toBe('string');
    expect(email.html).toBe('<p>&lt;b&gt;Eve&lt;/b&gt;</p>');
    expect(email.text).toBe('Hi <b>Eve</b>');
  });
});

// ── Отправка ────────────────────────────────────────────────────────────────

function recipients(n: number): NewsletterRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    uid: `u${i}`, email: `user${i}@mail.fr`, name: `User ${i}`, lang: i % 2 ? 'FR' : 'RU',
  }));
}

function fakeDeps(opts: {
  recipients: number; sentToday: number | null; dailyLimit?: number;
  sendBatch?: (emails: ResendEmail[]) => Promise<BatchOutcome>;
}) {
  const batches: ResendEmail[][] = [];
  const logged: unknown[] = [];
  const deps: NewsletterDeps = {
    dailyLimit: opts.dailyLimit ?? 100,
    apiKey: 'test-key',
    from: 'Théâtre <hello@theatre.fr>',
    loadRecipients: async () => recipients(opts.recipients),
    readUsage: async () => opts.sentToday === null ? null : { sentToday: opts.sentToday, source: 'resend-header' },
    sendBatch: async (emails) => {
      batches.push(emails);
      return opts.sendBatch ? opts.sendBatch(emails) : { ok: true, status: 200, rejectedIndexes: [] };
    },
    logDeliveries: async (entries) => { logged.push(...entries); },
    acquireLock: async () => true,
    releaseLock: vi.fn(async () => {}),
  };
  return { deps, batches, logged };
}

const request: NewsletterSendRequest = {
  showId: 'romantika',
  drafts: {
    RU: { subject: 'RU', html: `<p>${NEWSLETTER_NAME_TOKEN}</p>`, text: 'ru /#/?show=romantika' },
    FR: { subject: 'FR', html: `<p>${NEWSLETTER_NAME_TOKEN}</p>`, text: 'fr /#/?show=romantika' },
  },
};

describe('sendNewsletter: без частичной отправки', () => {
  it('50 получателей, остаток 60 → отправлены все, отдельными письмами', async () => {
    const { deps, batches, logged } = fakeDeps({ recipients: 50, sentToday: 40 });
    const result = await sendNewsletter(request, 'admin', deps);
    expect(result).toEqual({ sent: 50, sentRU: 25, sentFR: 25, failed: 0, notAttempted: 0, stoppedReason: null });
    expect(batches.flat()).toHaveLength(50);
    expect(new Set(batches.flat().map(e => e.to)).size).toBe(50);
    expect(logged).toHaveLength(50);
  });

  it('50 получателей, остаток 40 → 409, отправлено 0 писем', async () => {
    const { deps, batches, logged } = fakeDeps({ recipients: 50, sentToday: 60 });
    const err = await sendNewsletter(request, 'admin', deps).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.reason).toBe('insufficient_quota');
    expect(err.details.preflight).toMatchObject({ required: 50, remaining: 40, canSendAll: false });
    expect(batches).toHaveLength(0);
    expect(logged).toHaveLength(0);
    expect(deps.releaseLock).toHaveBeenCalled();
  });

  it('квота пересчитывается на сервере перед отправкой — устаревший preflight не помогает', async () => {
    // В админке было «остаток 60», но пока админ подтверждал, ушли письма о бронях.
    let reads = 0;
    const { deps, batches } = fakeDeps({ recipients: 50, sentToday: 40 });
    deps.readUsage = async () => ({ sentToday: reads++ === 0 ? 40 : 70, source: 'resend-header' });
    await deps.readUsage(); // preflight админки
    await expect(sendNewsletter(request, 'admin', deps)).rejects.toMatchObject({ reason: 'insufficient_quota' });
    expect(batches).toHaveLength(0);
  });

  it('квоту посчитать не удалось → ничего не отправляется', async () => {
    const { deps, batches } = fakeDeps({ recipients: 5, sentToday: null });
    await expect(sendNewsletter(request, 'admin', deps)).rejects.toMatchObject({ reason: 'insufficient_quota' });
    expect(batches).toHaveLength(0);
  });

  it('параллельная рассылка не стартует', async () => {
    const { deps, batches } = fakeDeps({ recipients: 5, sentToday: 0 });
    deps.acquireLock = async () => false;
    await expect(sendNewsletter(request, 'admin', deps)).rejects.toMatchObject({ reason: 'newsletter_in_progress' });
    expect(batches).toHaveLength(0);
  });

  it('ошибка квоты Resend → остановка без повторов, честный отчёт', async () => {
    const { deps, batches, logged } = fakeDeps({
      recipients: 250, sentToday: 0, dailyLimit: 1000,
      sendBatch: async () => batches.length === 1
        ? { ok: true, status: 200, rejectedIndexes: [] }
        : { ok: false, status: 429, reason: 'daily_quota_exceeded' },
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendNewsletter(request, 'admin', deps);
    expect(batches).toHaveLength(2);       // третья пачка не отправлялась, повторов нет
    expect(result).toMatchObject({ sent: 100, failed: 100, notAttempted: 50, stoppedReason: 'daily_quota_exceeded' });
    expect(logged).toHaveLength(200);
    expect(errorLog).toHaveBeenCalledWith('[newsletter] stopped: Resend rejected batch', expect.objectContaining({ status: 429 }));
    errorLog.mockRestore();
  });

  it('частично отклонённая пачка не считается успехом', async () => {
    const { deps } = fakeDeps({
      recipients: 3, sentToday: 0,
      sendBatch: async () => ({ ok: true, status: 200, rejectedIndexes: [1] }),
    });
    expect(await sendNewsletter(request, 'admin', deps)).toMatchObject({ sent: 2, failed: 1 });
  });

  it('Batch API: не больше 100 писем за запрос', async () => {
    const { deps, batches } = fakeDeps({ recipients: 230, sentToday: 0, dailyLimit: 1000 });
    await sendNewsletter(request, 'admin', deps);
    expect(batches.map(b => b.length)).toEqual([100, 100, 30]);
  });
});

describe('ответы Resend', () => {
  it('различает дневную квоту, месячную квоту и rate limit', () => {
    expect(classifyResendError(429, { name: 'daily_quota_exceeded' })).toBe('daily_quota_exceeded');
    expect(classifyResendError(429, { name: 'monthly_quota_exceeded' })).toBe('monthly_quota_exceeded');
    expect(classifyResendError(429, { name: 'rate_limit_exceeded' })).toBe('rate_limit_exceeded');
    expect(classifyResendError(429, null)).toBe('rate_limit_exceeded');
    expect(classifyResendError(500, null)).toBe('provider_error');
  });

  it('batch-отправитель превращает 429 квоты в остановку, а не в исключение', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ statusCode: 429, name: 'daily_quota_exceeded', message: 'quota' }),
      { status: 429, headers: { 'ratelimit-remaining': '9' } },
    )) as unknown as typeof fetch;
    const send = createResendBatchSender('key', fetchImpl);
    expect(await send([{ from: 'f', to: 't@x.fr', subject: 's', html: 'h', text: 't' }]))
      .toEqual({ ok: false, status: 429, reason: 'daily_quota_exceeded' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('поштучная рассылка через /api/send-email закрыта', () => {
  it('тип newsletter убран из whitelist send-email', () => {
    const types = projectSource('server/email/email.types.ts');
    const whitelist = types.slice(types.indexOf('ALLOWED_EMAIL_TYPES = ['), types.indexOf('] as const'));
    expect(whitelist).not.toContain("'newsletter'");
  });

  it('клиент больше не читает адреса подписчиков', () => {
    expect(projectSource('src/services/userService.ts')).not.toContain('getUsersForNewsletter');
    expect(screenSource('src/pages/AdminPage')).not.toContain('recipient.email');
  });
});
