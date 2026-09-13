// Вкладка «Рассылка»: выбор спектакля, публичная ссылка, лимит Resend,
// подтверждение и отчёт об отправке.

import { useEffect } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getShowPublicUrl } from '../../utils/showUrl';
import type { NewsletterPreflight, NewsletterSendResult, QuotaSource } from '../../../shared/contracts/newsletter';
import type { Newsletter } from './useNewsletter';
import styles from './AdminPage.module.scss';

const QUOTA_SOURCE_LABEL: Record<QuotaSource, string> = {
  'resend-header': 'счётчик дневной квоты Resend',
  'resend-list':   'список писем Resend за сутки (UTC)',
  'email-log':     'журнал отправок сайта — Resend недоступен',
};

const STOP_REASON_LABEL: Record<NonNullable<NewsletterSendResult['stoppedReason']>, string> = {
  daily_quota_exceeded:   'Resend ответил: исчерпан дневной лимит писем.',
  monthly_quota_exceeded: 'Resend ответил: исчерпан месячный лимит писем.',
  rate_limit_exceeded:    'Resend ответил: слишком много запросов в секунду.',
  provider_error:         'Resend отклонил запрос или не ответил.',
};

/** Почему отправить нельзя — или null, если можно. */
function blockReason(p: NewsletterPreflight): string | null {
  if (!p.providerConfigured) return 'Почтовый провайдер не настроен на сервере. Рассылка недоступна.';
  if (p.quotaSource === null) return 'Не удалось посчитать, сколько писем уже отправлено сегодня. Рассылка недоступна.';
  if (p.recipients === 0)     return 'Нет подписчиков с включёнными уведомлениями.';
  if (p.required > p.remaining) {
    return `Недостаточно дневного лимита Resend.\nПолучателей: ${p.required}.\nДоступно примерно: ${p.remaining}.\n`
      + 'Рассылка не была запущена.\nДождитесь обновления лимита (полночь UTC) или уменьшите список получателей.';
  }
  return null;
}

export function NewsletterTab({ newsletter }: { newsletter: Newsletter }) {
  const {
    shows, showId, selectedShow, selectShow, preflight, preflightLoading, preflightError,
    refreshPreflight, confirmOpen, requestSend, cancelSend, confirmSend,
    sending, result, sendError, copiedLink, copyShowLink,
  } = newsletter;

  // Получатели не зависят от спектакля: проверяем при открытии вкладки,
  // перед подтверждением и после отправки.
  useEffect(() => { void refreshPreflight(); }, [refreshPreflight]);

  const blocked  = preflight ? blockReason(preflight) : null;
  const canStart = !!selectedShow && !!preflight?.canSendAll && !sending && !preflightLoading;
  const hasFailures = !!result && (result.failed > 0 || result.notAttempted > 0);

  return (
    <div className={styles.newsletterWrap}>
      <h2 className={styles.newsletterTitle}>Рассылка нового спектакля</h2>
      <p className={styles.newsletterHint}>
        Письмо уйдёт только пользователям с включёнными уведомлениями — по одному письму на адрес.
        Рассылка запускается вручную — автоматически ничего не отправляется.
      </p>

      <div className={styles.section}>
        <label className={styles.sectionLabel} htmlFor="nl-show">Выбрать спектакль</label>
        <select
          id="nl-show"
          className={styles.select}
          value={showId}
          onChange={e => selectShow(e.target.value)}
          disabled={sending}
        >
          {shows.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <div className={styles.showLinkRow}>
          <input
            className={styles.showLinkInput}
            value={showId ? getShowPublicUrl(showId) : ''}
            readOnly
            aria-label="Публичная ссылка на спектакль"
          />
          <button
            className={styles.copyLinkBtn}
            onClick={copyShowLink}
            type="button"
            disabled={!showId}
          >
            {copiedLink ? 'Скопировано' : 'Копировать ссылку'}
          </button>
        </div>
      </div>

      <div className={styles.quotaBox} aria-live="polite">
        {preflight ? (
          <>
            <p>Получателей: <strong>{preflight.recipients}</strong></p>
            <p>Отправлено сегодня: <strong>{preflight.sentToday} / {preflight.dailyLimit}</strong></p>
            <p>Оценочный остаток: <strong>≈ {preflight.remaining}</strong></p>
            {preflight.quotaSource && (
              <p className={styles.quotaNote}>
                Источник: {QUOTA_SOURCE_LABEL[preflight.quotaSource]}. Лимит {preflight.dailyLimit}/день
                задан в настройках сервера — это оценка, а не данные биллинга Resend.
              </p>
            )}
          </>
        ) : (
          <p>{preflightLoading ? 'Проверяем получателей и лимит Resend…' : preflightError ?? 'Лимит ещё не проверен.'}</p>
        )}
        <button
          type="button"
          className={styles.copyLinkBtn}
          onClick={() => void refreshPreflight()}
          disabled={preflightLoading || sending}
        >
          {preflightLoading ? 'Проверяем…' : 'Обновить'}
        </button>
      </div>

      {blocked && (
        <div className={`${styles.newsletterResult} ${styles.newsletterResultError}`} role="alert">
          <p className={styles.preLine}>{blocked}</p>
        </div>
      )}

      <button
        className={styles.newsletterSendBtn}
        onClick={() => void requestSend()}
        disabled={!canStart}
      >
        {sending ? 'Отправляется…' : 'Отправить рассылку'}
      </button>

      {sendError && (
        <div className={`${styles.newsletterResult} ${styles.newsletterResultError}`} role="alert">
          <p>{sendError}</p>
        </div>
      )}

      {result && (
        <div className={`${styles.newsletterResult} ${hasFailures ? styles.newsletterResultError : ''}`}>
          <p>Успешно: <strong>{result.sent}</strong></p>
          <p>Ошибок: <strong>{result.failed}</strong></p>
          {result.notAttempted > 0 && <p>Не отправлено (рассылка остановлена): <strong>{result.notAttempted}</strong></p>}
          <p>RU: <strong>{result.sentRU}</strong> · FR: <strong>{result.sentFR}</strong></p>
          {result.stoppedReason && <p>{STOP_REASON_LABEL[result.stoppedReason]} Повторных попыток не было.</p>}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Отправить рассылку?"
        message={preflight && selectedShow
          ? `Спектакль: ${selectedShow.title}\nПолучателей: ${preflight.recipients}\n`
            + `Доступно сегодня: ≈ ${preflight.remaining}\nБудет отправлено: ${preflight.required}`
          : ''}
        confirmLabel="Отправить рассылку"
        cancelLabel="Отмена"
        loading={sending}
        confirmDisabled={!preflight?.canSendAll}
        onCancel={cancelSend}
        onConfirm={() => void confirmSend()}
      />
    </div>
  );
}
