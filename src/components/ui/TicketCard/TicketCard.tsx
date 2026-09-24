import { useLang } from '../../../i18n/LangContext';
import type { Booking } from '../../../types/booking';
import { STUB_BARCODE_WIDTHS, parseShowDateParts, getStubVariant } from '../../../utils/ticketStub';
import { ticketTypeLabel } from '../../../utils/ticketType';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import { TicketQrPanel } from './TicketQrPanel';
import { onlineBookingState } from '../../../utils/onlinePayment';
import styles from './TicketCard.module.scss';

interface Props {
  booking: Booking;
  isExpanded: boolean;
  onToggle: () => void;
}

export function TicketCard({ booking: b, isExpanded, onToggle }: Props) {
  const { lang } = useLang();
  const isFR = lang === 'FR';
  const stubVariant = getStubVariant(b);
  const payStatus  = b.paymentStatus ?? 'not_paid';

  const { day, monthAbbrev } = parseShowDateParts(b.showDate, isFR);
  const timeLabel = `${monthAbbrev} · ${b.showTime}`;

  const ticketLabel = ticketTypeLabel(b.ticketType, isFR ? 'FR' : 'RU');

  // Текст кнопки меняется в зависимости от collapsed/expanded
  let ctaCollapsed = '';
  let ctaExpanded  = isFR ? 'Masquer ↑' : 'Скрыть ↑';
  let ctaClass     = styles.actionMuted;

  if (b.status !== 'cancelled' && payStatus !== 'expired') {
    if (payStatus === 'paid') {
      ctaCollapsed = isFR ? 'Afficher QR →' : 'Показать QR →';
      ctaExpanded  = isFR ? 'Masquer QR ↑'  : 'Скрыть QR ↑';
      ctaClass     = styles.actionMuted;
    } else if (payStatus === 'awaiting_transfer') {
      ctaCollapsed = isFR ? 'Détails du virement →' : 'Реквизиты перевода →';
      ctaExpanded  = isFR ? 'Masquer ↑' : 'Скрыть ↑';
      ctaClass     = styles.actionAmber;
    } else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') {
      ctaCollapsed = isFR ? 'Afficher QR →' : 'Показать QR →';
      ctaExpanded  = isFR ? 'Masquer QR ↑'  : 'Скрыть QR ↑';
      ctaClass     = styles.actionAmber;
    }
  }

  const ctaText = isExpanded ? ctaExpanded : ctaCollapsed;

  return (
    <div className={styles.ticketRoot}>

      {/* ── Mini-ticket card — clean, no inner blocks ── */}
      <div
        className={`${styles.ticket} ${isExpanded ? styles.ticketOpen : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        {/* LEFT STUB */}
        <div className={`${styles.stub} ${
          stubVariant === 'amber' ? styles.stubAmber :
          stubVariant === 'grey'  ? styles.stubGrey  :
          styles.stubBurgundy
        }`}>
          <div className={styles.stubDay}>{day}</div>
          <div className={`${styles.stubMonth} ${
            stubVariant === 'amber' ? styles.stubMonthAmber :
            stubVariant === 'grey'  ? styles.stubMonthGrey  : ''
          }`}>{timeLabel}</div>
          <div className={styles.stubBarcode} aria-hidden="true">
            {STUB_BARCODE_WIDTHS.map((w, i) => (
              <div key={i} style={{ width: `${w}px` }} />
            ))}
          </div>
          <div className={styles.stubCutoutTop}    aria-hidden="true" />
          <div className={styles.stubCutoutBottom} aria-hidden="true" />
        </div>

        {/* RIGHT CONTENT */}
        <div className={styles.headerContent}>
          {/* Row 1: title + stamp */}
          <div className={styles.headerRow1}>
            <p className={styles.showTitle}>{localizedShowTitle(b, lang)}</p>
            <StampBadge booking={b} isFR={isFR} />
          </div>

          {/* Row 2: composition */}
          <p className={styles.compositionLine}>
            <span className={styles.compositionCount}>{b.ticketsCount} × {ticketLabel}</span>
            {b.totalAmount > 0 && <>
              <span className={styles.compositionSep}> · </span>
              <span className={styles.compositionAmount}>{b.totalAmount} €</span>
            </>}
          </p>

          {/* Row 3: code + CTA */}
          <div className={styles.headerRow3}>
            <code className={styles.ticketCode}>{b.ticketCode}</code>
            {ctaText && (
              <span className={`${styles.actionText} ${ctaClass}`}>{ctaText}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Expanded coupon panel — sibling, not nested inside ticket ── */}
      <div
        className={`${styles.panel} ${isExpanded ? styles.panelOpen : ''}`}
        aria-hidden={!isExpanded}
      >
        <div className={styles.panelInner}>

          {/* Tear-off perforation line */}
          <div className={styles.tearOff} aria-hidden="true">
            <div className={styles.tearOffLeft} aria-hidden="true" />
            <div className={styles.tearOffRight} aria-hidden="true" />
          </div>

          {/* Paper body: QR, код брони и PDF — тот же блок, что в карточке брони с переводом. */}
          <TicketQrPanel booking={b} active={isExpanded} />
        </div>
      </div>

    </div>
  );
}

export function StampBadge({ booking: b, isFR }: { booking: Booking; isFR: boolean }) {
  const { t } = useLang();
  const payStatus = b.paymentStatus ?? 'not_paid';
  const status    = b.status;
  const online    = onlineBookingState(b);

  let rotation = 'rotate(4deg)';
  if (payStatus === 'expired')                                         rotation = 'rotate(2deg)';
  else if (status === 'cancelled')                                     rotation = 'rotate(-5deg)';
  else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') rotation = 'rotate(0deg)';
  else if (payStatus === 'awaiting_transfer' || status === 'pending')  rotation = 'rotate(-3deg)';

  let stampClass: string;
  let label: string;

  if (online === 'refund_pending' || online === 'refunded') {
    stampClass = styles.stampMuted;
    label = t.payment.stampRefund;
  } else if (status === 'cancelled' || payStatus === 'expired') {
    stampClass = styles.stampMuted;
    label = isFR ? 'ANNULÉ' : 'ОТМЕНЕНО';
  } else if (online === 'awaiting') {
    // Онлайн-оплата не завершена: билета нет, пока Stripe не подтвердит оплату.
    stampClass = styles.stampAmber;
    label = t.payment.stampAwaiting;
  } else if (payStatus === 'awaiting_transfer') {
    stampClass = styles.stampAmber;
    label = isFR ? 'EN ATTENTE' : 'ОЖИДАЕТ ОПЛАТЫ';
  } else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') {
    stampClass = styles.stampAmber;
    label = isFR ? 'SUR PLACE' : 'ОПЛАТА НА МЕСТЕ';
  } else {
    stampClass = styles.stampGreen;
    label = payStatus === 'paid' ? (isFR ? 'PAYÉ' : 'ОПЛАЧЕНО') : (isFR ? 'CONFIRMÉ' : 'ПОДТВЕРЖДЕНО');
  }

  return (
    <span className={`${styles.stamp} ${stampClass}`} style={{ transform: rotation }}>
      {label}
    </span>
  );
}
