// Вкладка «Рассылка»: выбор спектакля, публичная ссылка и отчёт об отправке.

import { SHOWS } from '../../data/shows';
import { getShowPublicUrl } from '../../utils/showUrl';
import type { Newsletter } from './useNewsletter';
import styles from './AdminPage.module.scss';

export function NewsletterTab({ newsletter }: { newsletter: Newsletter }) {
  const { showId, selectShow, sending, result, copiedLink, copyShowLink, send } = newsletter;

  return (
    <div className={styles.newsletterWrap}>
      <h2 className={styles.newsletterTitle}>Рассылка нового спектакля</h2>
      <p className={styles.newsletterHint}>
        Письмо уйдёт только пользователям с включёнными уведомлениями.
        Рассылка запускается вручную — автоматически ничего не отправляется.
      </p>

      <div className={styles.newsletterWarning}>
        На бесплатном тарифе Resend не запускать рассылку несколько раз подряд, потому что упремся в лимиты!!!
      </div>

      <div className={styles.section}>
        <label className={styles.sectionLabel} htmlFor="nl-show">Выбрать спектакль</label>
        <select
          id="nl-show"
          className={styles.select}
          value={showId}
          onChange={e => selectShow(e.target.value)}
          disabled={sending}
        >
          {SHOWS.map(s => (
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

      <button
        className={styles.newsletterSendBtn}
        onClick={send}
        disabled={sending}
      >
        {sending ? 'Отправляется…' : 'Отправить рассылку'}
      </button>

      {result && (
        <div className={`${styles.newsletterResult} ${result.errors.length > 0 ? styles.newsletterResultError : ''}`}>
          <p>Отправлено успешно: <strong>{result.sent}</strong></p>
          <p>Отправлено RU: <strong>{result.sentRU}</strong></p>
          <p>Отправлено FR: <strong>{result.sentFR}</strong></p>
          <p>Ошибок: <strong>{result.errors.length}</strong></p>
          {result.errors.length > 0 && (
            <>
              <p>Не удалось отправить ({result.errors.length}):</p>
              <ul>
                {result.errors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </>
          )}
          {result.sent === 0 && result.errors.length === 0 && (
            <p>Нет подписчиков с включёнными уведомлениями.</p>
          )}
        </div>
      )}
    </div>
  );
}
