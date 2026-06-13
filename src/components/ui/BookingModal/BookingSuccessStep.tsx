import type { Show, TicketType } from '../../../types';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show;
  lang: 'RU' | 'FR';
  t: {
    booking: {
      successTitle: string;
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

  tickets: number;
  activeTicket: TicketType | null;
  savedAmount: number;
  ticketCode: string;
  payment: string;
  userEmail: string;

  copiedCode: boolean;
  onCopyCode: () => void;
  onClose: () => void;
}

export function BookingSuccessStep({
  show, lang, t,
  tickets, activeTicket, savedAmount, ticketCode, payment, userEmail,
  copiedCode,
  onCopyCode,
  onClose,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const monthLabel = t.months[show.month] ?? show.month;

  function ticketLabel(id: string | undefined) {
    return id === 'standard' ? t.admin.ticketStandard
         : id === 'student'  ? t.admin.ticketStudent
         : (id ?? '');
  }

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
          <div className={styles.stubCodeLabel}>КОД БРОНИ</div>
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

        <div className={styles.successStamp}>
          {lang === 'FR' ? 'ACCEPTÉ' : 'ПРИНЯТО'}
        </div>

        <h3 className={styles.successTitle}>{t.booking.successTitle}</h3>

        <div className={styles.successSummary}>
          <div className={styles.summaryRow}>
            <span>{t.booking.labelTickets}</span>
            <span>{tickets} × {ticketLabel(activeTicket?.id)}</span>
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

        {payment === 'on_site' ? (
          <p className={styles.successText}>
            {lang === 'FR'
              ? 'Votre réservation est bien reçue. Les détails de votre réservation ont été envoyés par e-mail. Le paiement se fera sur place avant le spectacle.'
              : 'Бронирование принято. Детали бронирования отправлены на вашу почту. Оплата будет произведена на месте перед спектаклем.'}
          </p>
        ) : (
          <p className={styles.successText}>
            {lang === 'FR'
              ? 'Votre réservation est bien reçue. Les coordonnées bancaires et le code de réservation ont été envoyés par e-mail.'
              : 'Бронирование принято. Реквизиты для оплаты и код брони отправлены на вашу почту.'}
          </p>
        )}

        <div className={styles.successActions}>
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
