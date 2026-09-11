// Ручная рассылка анонса спектакля.
//
// Письма шлются по одному и последовательно: считаем реально подтверждённые
// отправки, а не количество попыток, иначе отчёт вводил бы в заблуждение.

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { SHOWS } from '../../data/shows';
import { getUsersForNewsletter } from '../../services/userService';
import { sendNewShowAnnouncementEmail } from '../../services/email';
import { getShowPublicUrl } from '../../utils/showUrl';
import type { NewsletterResult } from './adminTypes';

/** Сколько держится подпись «Скопировано» у кнопки ссылки, мс. */
const COPIED_HINT_MS = 1800;

/** С какого числа получателей предупреждаем про лимиты Resend. */
const RESEND_WARN_THRESHOLD = 100;

export interface Newsletter {
  showId: string;
  selectShow: (id: string) => void;
  sending: boolean;
  result: NewsletterResult | null;
  clearResult: () => void;
  copiedLink: boolean;
  copyShowLink: () => Promise<void>;
  send: () => Promise<void>;
}

export function useNewsletter(user: User | null): Newsletter {
  const [showId,     setShowId]     = useState<string>(SHOWS[0]?.id ?? '');
  const [sending,    setSending]    = useState(false);
  const [result,     setResult]     = useState<NewsletterResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  async function copyShowLink() {
    const show = SHOWS.find(s => s.id === showId);
    if (!show) return;
    await navigator.clipboard.writeText(getShowPublicUrl(show.id));
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), COPIED_HINT_MS);
  }

  async function send() {
    const show = SHOWS.find(s => s.id === showId);
    if (!show) return;

    const recipients = await getUsersForNewsletter();
    if (recipients.length === 0) {
      setResult({ sent: 0, sentRU: 0, sentFR: 0, errors: [] });
      return;
    }

    const confirmed = window.confirm(
      `Будет отправлено ${recipients.length} писем${recipients.length > RESEND_WARN_THRESHOLD ? '\n\nБольше 100 получателей — проверьте лимиты Resend.' : ''}. Продолжить?`
    );
    if (!confirmed) return;

    // Получаем ID token текущего пользователя для аутентификации рассылки на сервере.
    // Сервер проверит, что роль — 'admin', прежде чем отправлять письма.
    let adminToken: string | undefined;
    try {
      if (user) adminToken = await user.getIdToken();
    } catch (e) {
      console.warn('[AdminPage] newsletter: failed to get ID token', e);
    }

    setSending(true);
    setResult(null);

    const errors: string[] = [];
    let sent = 0;
    let sentRU = 0;
    let sentFR = 0;
    const showDate = `${show.day} ${show.month} ${show.year}`;
    const showUrl  = getShowPublicUrl(show.id);

    for (const recipient of recipients) {
      const lang = recipient.language === 'fr' ? 'FR' : 'RU';
      try {
        const ok = await sendNewShowAnnouncementEmail({
          userEmail:   recipient.email,
          userName:    recipient.displayName || recipient.email,
          showTitle:   lang === 'FR' ? (show.titleFR ?? show.title) : show.title,
          showDate,
          showTime:    show.time,
          price:       lang === 'FR' ? (show.priceFR ?? show.price) : show.price,
          description: lang === 'FR' ? (show.descFR ?? show.desc) : show.desc,
          showUrl,
          lang,
        }, adminToken);
        // Честный результат: считаем письмо успешным только если API реально подтвердил отправку.
        if (ok) {
          sent++;
          if (lang === 'FR') sentFR++;
          else sentRU++;
        } else {
          errors.push(recipient.email);
        }
      } catch {
        errors.push(recipient.email);
      }
    }

    setSending(false);
    setResult({ sent, sentRU, sentFR, errors });
  }

  return {
    showId,
    selectShow: (id) => { setShowId(id); setResult(null); },
    sending,
    result,
    clearResult: () => setResult(null),
    copiedLink,
    copyShowLink,
    send,
  };
}
