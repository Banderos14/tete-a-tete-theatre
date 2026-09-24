import type { Show } from '../../../types';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show;
  lang: 'RU' | 'FR';
  t: {
    booking: {
      successTitle: string;
      successOnSite: string;
      successTransfer: string;
      successEmailFailed: string;
      myTickets: string;
      labelTickets: string;
      labelAmount: string;
      copied: string;
      close: string;
    };
    admin: {
      ticketStandard: string;
      ticketStudent: string;
    };
    months: Record<string, string>;
  };

  /** Состав брони словами: «2 × Обычный, 2 × Ученик / студент». */
  composition: string;
  savedAmount: number;
  /** false — сервер не смог отправить письмо-билет; билет всё равно есть в кабинете. */
  ticketEmailSent: boolean;
  ticketCode: string;
  payment: string;
  userEmail: string;

  copiedCode: boolean;
  onCopyCode: () => void;
  /** Ведёт в кабинет, где лежит QR. Необязателен: без него кнопка не рисуется. */
  onOpenTickets?: () => void;
  onClose: () => void;
}

export function BookingSuccessStep({
  show, lang, t,
  composition, savedAmount, ticketEmailSent, ticketCode, payment, userEmail,
  copiedCode,
  onCopyCode,
  onOpenTickets,
  onClose,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const monthLabel = t.months[show.month] ?? show.month;

  return (
    <div className={styles.successWrap}>

      {/* КОРЕШОК */}
      <div className={styles.stub}>
        <div className={styles.stubTop}>
          <div className={styles.stubEyebrow}>Théâtre Tête-à-Tête</div>
          <p className={styles.stubTitle}>{showTitle}</p>
          <p className={styles.stubMeta}>{show.day} {monthLabel} {show.year} · {show.time}</p>
        </div>
        <div className={styles.stubBottom}>
          <div className={styles.stubCodeLabel}>{lang === 'FR' ? 'CODE RÉSA' : 'КОД БРОНИ'}</div>
          <div className={styles.stubCode}>{ticketCode}</div>
          <div className={styles.barcode} aria-hidden="true">
            {[2,5,2,3,7,2,4,2,6,3,2,5].map((w, i) => (
              <div key={i} style={{ width: w, height: 22, background: '#f3e7dc' }} />
            ))}
          </div>
        </div>
        <div className={styles.perfTop} aria-hidden="true" />
        <div className={styles.perfBottom} aria-hidden="true" />
        <div className={styles.perfLine} aria-hidden="true" />
      </div>

      {/* ПРАВАЯ ЧАСТЬ */}
      <div className={styles.successRight}>

        {/* Скроллируемая область — только контент, без кнопок */}
        <div className={styles.successContent} data-scroll-lock-allow="true">

          <div className={styles.successStamp}>
            {lang === 'FR' ? 'ACCEPTÉ' : 'ПРИНЯТО'}
          </div>

          <h3 className={styles.successTitle}>{t.booking.successTitle}</h3>

          <div className={styles.successSummary}>
            <div className={styles.summaryRow}>
              <span>{t.booking.labelTickets}</span>
              <span>{composition}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{t.booking.labelAmount}</span>
              <span className={styles.summaryAmount}>{savedAmount}&nbsp;€</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{lang === 'FR' ? 'Détails envoyés à' : 'Детали отправлены'}</span>
              <span>{userEmail}</span>
            </div>
          </div>

          {/* Зритель должен уйти отсюда, понимая, ГДЕ его билет и что с ним делать:
              QR в письме (и в кабинете). Если письмо не ушло — честно ведём в кабинет. */}
          <p className={styles.successText}>
            {!ticketEmailSent
              ? t.booking.successEmailFailed
              : payment === 'on_site' ? t.booking.successOnSite : t.booking.successTransfer}
          </p>

        </div>

        {/* Кнопки вне зоны скролла — всегда видны внизу */}
        <div className={styles.successActions}>
          {onOpenTickets && (
            <button className={styles.ticketsBtn} onClick={onOpenTickets}>
              {t.booking.myTickets}
            </button>
          )}
          <button className={styles.closeSuccessBtn} onClick={onClose}>{t.booking.close}</button>
          <button
            className={`${styles.copyBtn} ${copiedCode ? styles.copyBtnDone : ''}`}
            onClick={onCopyCode}
          >
            {copiedCode ? t.booking.copied : (
              <>
                <span className={styles.copyIcon} aria-hidden="true" />
                {lang === 'FR' ? 'Code de réservation' : 'Код брони'}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
