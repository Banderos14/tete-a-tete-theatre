// Рассылка анонса спектакля через /api/newsletter.
//
// Клиент не видит ни адресов подписчиков, ни ключа Resend: он собирает
// черновики письма на двух языках, а получателей, квоту и отправку ведёт сервер.

import type { Show } from '../types';
import { buildNewShowEmail } from './email';
import { getShowPublicUrl } from '../utils/showUrl';
import {
  NEWSLETTER_LANGS, NEWSLETTER_NAME_TOKEN,
  type NewsletterDraft, type NewsletterLang, type NewsletterPreflight,
  type NewsletterSendRequest, type NewsletterSendResult,
} from '../../shared/contracts/newsletter';

const ENDPOINT = '/api/newsletter';

export class NewsletterApiError extends Error {
  readonly status: number;
  readonly reason?: string;
  /** Свежий preflight сервера — приходит, когда рассылку не запустили из-за квоты. */
  readonly preflight?: NewsletterPreflight;

  constructor(status: number, message: string, reason?: string, preflight?: NewsletterPreflight) {
    super(message);
    this.name = 'NewsletterApiError';
    this.status = status;
    this.reason = reason;
    this.preflight = preflight;
  }
}

async function call<T>(idToken: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(ENDPOINT, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  });
  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
  if (!resp.ok) {
    throw new NewsletterApiError(
      resp.status,
      typeof data.error === 'string' ? data.error : `HTTP ${resp.status}`,
      typeof data.reason === 'string' ? data.reason : undefined,
      (data.preflight as NewsletterPreflight | undefined) ?? undefined,
    );
  }
  return data as T;
}

export function fetchNewsletterPreflight(idToken: string): Promise<NewsletterPreflight> {
  return call<NewsletterPreflight>(idToken, { method: 'GET' });
}

/** Черновик на одном языке: имя получателя — метка, её заменит сервер. */
export function buildNewsletterDraft(show: Show, lang: NewsletterLang): NewsletterDraft {
  const isFR = lang === 'FR';
  return buildNewShowEmail({
    userEmail:   '',
    userName:    NEWSLETTER_NAME_TOKEN,
    showTitle:   isFR ? (show.titleFR ?? show.title) : show.title,
    showDate:    `${show.day} ${show.month} ${show.year}`,
    showTime:    show.time,
    price:       isFR ? (show.priceFR ?? show.price) : show.price,
    description: isFR ? (show.descFR ?? show.desc) : show.desc,
    showUrl:     getShowPublicUrl(show.id),
    lang,
  });
}

export function buildNewsletterRequest(show: Show): NewsletterSendRequest {
  const drafts = Object.fromEntries(
    NEWSLETTER_LANGS.map(lang => [lang, buildNewsletterDraft(show, lang)]),
  ) as Record<NewsletterLang, NewsletterDraft>;
  return { showId: show.id, drafts };
}

export function sendNewsletterViaApi(idToken: string, show: Show): Promise<NewsletterSendResult> {
  return call<NewsletterSendResult>(idToken, {
    method: 'POST',
    body:   JSON.stringify(buildNewsletterRequest(show)),
  });
}
