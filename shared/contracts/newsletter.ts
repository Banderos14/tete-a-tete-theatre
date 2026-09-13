// Контракт рассылки анонса спектакля: /api/newsletter.
//
// GET  — предварительная проверка (preflight): сколько получателей и хватит ли
//        дневной квоты Resend. Адреса получателей наружу не отдаются никогда.
// POST — отправка. Сервер сам выбирает получателей и перед первым письмом
//        заново проверяет квоту: preflight на клиенте — подсказка, не гарантия.

/**
 * Метка на месте имени получателя в черновике письма.
 *
 * Шаблон письма собирает клиент (как и у остальных писем проекта), но адресов
 * и имён подписчиков у него нет. Поэтому черновик приходит с меткой, а сервер
 * подставляет имя каждого получателя — в HTML уже экранированным.
 */
export const NEWSLETTER_NAME_TOKEN = '%%RECIPIENT_NAME%%';

export const NEWSLETTER_LANGS = ['RU', 'FR'] as const;
export type NewsletterLang = (typeof NEWSLETTER_LANGS)[number];

/**
 * Откуда взято число «отправлено сегодня».
 *
 * - `resend-header` — заголовок x-resend-daily-quota (израсходованная дневная
 *   квота, Resend присылает его только на Free-плане);
 * - `resend-list`   — подсчёт писем за текущие UTC-сутки через GET /emails;
 * - `email-log`     — журнал отправок сайта (emailLog), если Resend недоступен.
 *
 * Лимит в любом случае берётся из серверной конфигурации, поэтому остаток —
 * всегда оценка, а не биллинговая истина Resend.
 */
export type QuotaSource = 'resend-header' | 'resend-list' | 'email-log';

export interface NewsletterPreflight {
  /** Получатели после фильтра и дедупликации адресов. */
  recipients:   number;
  /** Все письма аккаунта Resend за текущие UTC-сутки — не только рассылка. */
  sentToday:    number;
  dailyLimit:   number;
  /** max(0, dailyLimit − sentToday). */
  remaining:    number;
  /** Сколько писем уйдёт рассылкой: ровно одно на получателя. */
  required:     number;
  canSendAll:   boolean;
  /** null — посчитать израсходованную квоту не удалось; отправка запрещена. */
  quotaSource:  QuotaSource | null;
  /** На сервере заданы RESEND_API_KEY и EMAIL_FROM. Без них отправки нет. */
  providerConfigured: boolean;
  /** Остаток оценочный: прямого API остатка квоты у Resend нет. */
  estimated:    true;
}

export interface NewsletterDraft {
  subject: string;
  html:    string;
  text:    string;
}

export interface NewsletterSendRequest {
  showId: string;
  drafts: Record<NewsletterLang, NewsletterDraft>;
}

/** Почему рассылка остановилась до конца списка. */
export type NewsletterStopReason =
  | 'daily_quota_exceeded'
  | 'monthly_quota_exceeded'
  | 'rate_limit_exceeded'
  | 'provider_error';

export interface NewsletterSendResult {
  /** Письма, которые Resend принял. */
  sent:        number;
  sentRU:      number;
  sentFR:      number;
  /** Письма, которые Resend отклонил. */
  failed:      number;
  /** Письма, до которых очередь не дошла из-за остановки. */
  notAttempted: number;
  stoppedReason: NewsletterStopReason | null;
}

/** Тело ответа 409, когда квоты не хватает: рассылка не запускалась. */
export interface NewsletterQuotaRejection {
  error:  string;
  reason: 'insufficient_quota';
  preflight: NewsletterPreflight;
}

/** Размер одного запроса Batch API Resend — не больше 100 писем. */
export const RESEND_BATCH_MAX = 100;
