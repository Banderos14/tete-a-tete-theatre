// Ручная рассылка анонса спектакля.
//
// Порядок: preflight (сколько получателей, хватит ли квоты Resend) →
// модалка подтверждения со свежими цифрами → один запрос на отправку.
// Получателей и квоту считает сервер и перед первым письмом проверяет их
// повторно, поэтому цифры здесь — подсказка администратору, а не разрешение.

import { useCallback, useState } from 'react';
import type { User } from 'firebase/auth';
import { afishaShows } from '../../data/shows';
import type { Show } from '../../types';
import { getShowPublicUrl } from '../../utils/showUrl';
import {
  NewsletterApiError, fetchNewsletterPreflight, sendNewsletterViaApi,
} from '../../services/newsletterService';
import type { NewsletterPreflight, NewsletterSendResult } from '../../../shared/contracts/newsletter';

/** Сколько держится подпись «Скопировано» у кнопки ссылки, мс. */
const COPIED_HINT_MS = 1800;

/**
 * Что можно анонсировать: ровно то, что сейчас в Афише — опубликованное,
 * ещё не прошедшее и открытое для продаж, по ОДНОЙ позиции на постановку.
 * У «Фунтика» шесть сеансов, но в списке он один: письмо ведёт на страницу
 * постановки (/#/?show=funtik), и зритель сам выбирает сеанс. Отдельного
 * списка нет — та же функция, что у Афиши (src/data/shows.ts → afishaShows).
 * Элемент — ближайший сеанс; ключ позиции — его productionId.
 */
export function newsletterShows(nowMs: number = Date.now()): readonly Show[] {
  return afishaShows(nowMs);
}

export interface Newsletter {
  shows: readonly Show[];
  showId: string;
  selectedShow: Show | null;
  selectShow: (id: string) => void;
  preflight: NewsletterPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  refreshPreflight: () => Promise<NewsletterPreflight | null>;
  confirmOpen: boolean;
  requestSend: () => Promise<void>;
  cancelSend: () => void;
  confirmSend: () => Promise<void>;
  sending: boolean;
  result: NewsletterSendResult | null;
  sendError: string | null;
  clearResult: () => void;
  copiedLink: boolean;
  copyShowLink: () => Promise<void>;
}

export function useNewsletter(user: User | null): Newsletter {
  // Список фиксируется при открытии вкладки — так же, как у Афиши.
  const [shows]                                 = useState<readonly Show[]>(() => newsletterShows());
  // showId здесь — постановка (productionId): ссылка и анонс — на неё целиком.
  const [showId,           setShowId]           = useState<string>(() => shows[0]?.productionId ?? '');
  const [preflight,        setPreflight]        = useState<NewsletterPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError,   setPreflightError]   = useState<string | null>(null);
  const [confirmOpen,      setConfirmOpen]      = useState(false);
  const [sending,          setSending]          = useState(false);
  const [result,           setResult]           = useState<NewsletterSendResult | null>(null);
  const [sendError,        setSendError]        = useState<string | null>(null);
  const [copiedLink,       setCopiedLink]       = useState(false);

  const selectedShow = shows.find(s => s.productionId === showId) ?? null;

  const refreshPreflight = useCallback(async (): Promise<NewsletterPreflight | null> => {
    if (!user) return null;
    setPreflightLoading(true);
    setPreflightError(null);
    try {
      const fresh = await fetchNewsletterPreflight(await user.getIdToken());
      setPreflight(fresh);
      return fresh;
    } catch (err) {
      setPreflight(null);
      setPreflightError(err instanceof NewsletterApiError && err.status === 403
        ? 'Нет прав администратора.'
        : 'Не удалось проверить получателей и лимит Resend. Рассылка недоступна, пока проверка не пройдёт.');
      return null;
    } finally {
      setPreflightLoading(false);
    }
  }, [user]);

  async function copyShowLink() {
    if (!selectedShow) return;
    await navigator.clipboard.writeText(getShowPublicUrl(selectedShow.productionId));
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), COPIED_HINT_MS);
  }

  async function requestSend() {
    if (!selectedShow) return;
    setResult(null);
    setSendError(null);
    // Модалка показывает свежие цифры, а не те, что были при открытии вкладки.
    const fresh = await refreshPreflight();
    if (fresh?.canSendAll) setConfirmOpen(true);
  }

  async function confirmSend() {
    if (!user || !selectedShow || !preflight?.canSendAll) return;
    setConfirmOpen(false);
    setSending(true);
    setSendError(null);
    try {
      setResult(await sendNewsletterViaApi(await user.getIdToken(), selectedShow));
    } catch (err) {
      if (err instanceof NewsletterApiError && err.reason === 'insufficient_quota' && err.preflight) {
        // Сервер перепроверил квоту и не отправил ни одного письма.
        setPreflight(err.preflight);
      } else if (err instanceof NewsletterApiError && err.reason === 'newsletter_in_progress') {
        setSendError('Рассылка уже идёт из другой вкладки или у другого администратора.');
      } else if (err instanceof NewsletterApiError && err.reason === 'provider_not_configured') {
        setSendError('Почтовый провайдер не настроен на сервере (RESEND_API_KEY / EMAIL_FROM).');
      } else {
        setSendError('Запрос на рассылку не выполнен. Проверьте отчёт Resend и журнал отправок, прежде чем пробовать снова.');
      }
    } finally {
      setSending(false);
      void refreshPreflight();
    }
  }

  return {
    shows,
    showId,
    selectedShow,
    selectShow: (id) => { setShowId(id); setResult(null); setSendError(null); },
    preflight,
    preflightLoading,
    preflightError,
    refreshPreflight,
    confirmOpen,
    requestSend,
    cancelSend: () => setConfirmOpen(false),
    confirmSend,
    sending,
    result,
    sendError,
    clearResult: () => { setResult(null); setSendError(null); },
    copiedLink,
    copyShowLink,
  };
}
