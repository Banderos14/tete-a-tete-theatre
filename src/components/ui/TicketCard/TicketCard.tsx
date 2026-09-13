import { useEffect, useRef, useState } from 'react';
import { IconDownload, IconLoader2, IconShare2 } from '@tabler/icons-react';
import { generateTicketQR } from '../../../services/qrService';
import { canShareFiles } from '../../../services/ticketPdfService';
import { useLang } from '../../../i18n/LangContext';
import type { Booking } from '../../../types/booking';
import { STUB_BARCODE_WIDTHS, parseShowDateParts, getStubVariant } from '../../../utils/ticketStub';
import { ticketTypeLabel } from '../../../utils/ticketType';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import { useTicketPdf } from './useTicketPdf';
import styles from './TicketCard.module.scss';

interface Props {
  booking: Booking;
  isExpanded: boolean;
  onToggle: () => void;
}

export function TicketCard({ booking: b, isExpanded, onToggle }: Props) {
  const { t, lang } = useLang();
  const [qrSrc,    setQrSrc]    = useState('');
  const [qrLoaded, setQrLoaded] = useState(false);
  const fetched = useRef(false);
  // В PDF попадает тот же qrSrc, что показан в кабинете, — второй QR не строится.
  const pdf = useTicketPdf(b, qrSrc, lang);

  // Возможности браузера не меняются за жизнь карточки — проверяем один раз.
  // Кнопку «Поделиться» показываем только там, где лист реально принимает файл.
  const [shareSupported] = useState(canShareFiles);
  // Подсказка про iPhone нужна на сенсорных устройствах с листом «Поделиться»
  // или когда PDF уже открылся в просмотре вместо загрузки. Без User-Agent.
  const [coarsePointer] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    if (!isExpanded || fetched.current) return;
    fetched.current = true;
    generateTicketQR(b.ticketCode)
      .then(src => { setQrSrc(src); setQrLoaded(true); })
      .catch(() => { setQrLoaded(true); });
  }, [b.ticketCode, isExpanded]);

  const isFR       = lang === 'FR';
  const pdfDisabled = !qrSrc || pdf.busy !== null;
  const showPdfHint = pdf.openedInPreview || (shareSupported && coarsePointer);
  const pdfErrorText =
    pdf.error === 'share'           ? t.ticketPdf.errorShare :
    pdf.error === 'preview-blocked' ? t.ticketPdf.errorPreviewBlocked :
    pdf.error === 'generate'        ? t.ticketPdf.errorGenerate : '';
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

          {/* Paper body */}
          <div className={styles.paperBody}>

            {/* QR column */}
            <div className={styles.qrCol}>
              <div className={styles.qrWrap}>
                {qrSrc
                  ? <img className={styles.qrImg} src={qrSrc} alt="QR" />
                  : <div className={`${styles.qrImg} ${qrLoaded ? styles.qrError : styles.qrLoading}`} />
                }
              </div>
              <p className={styles.qrHint}>
                {isFR
                  ? "Présentez ce QR code au personnel à l'entrée"
                  : 'Покажите этот QR-код сотруднику театра при входе'}
              </p>
            </div>

            {/* Details column */}
            <div className={styles.details}>
              <p className={styles.detailTheatre}>Théâtre Tête-à-Tête</p>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Date'    : 'Дата'   }</dt>
                  <dd>{b.showDate}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Heure'   : 'Время'  }</dt>
                  <dd>{b.showTime}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Lieu'    : 'Адрес'  }</dt>
                  <dd>24 Rue Rossini, Nice</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Billets' : 'Билеты' }</dt>
                  <dd>
                    {b.ticketsCount}
                    {b.totalAmount > 0 && (
                      <> · <span>{b.totalAmount} €</span></>
                    )}
                  </dd>
                </div>
              </dl>

              <div className={styles.codeRow}>
                <div className={styles.codeTextPart}>
                  <span className={styles.codeLabel}>
                    {isFR ? 'Réservation' : 'Код брони'}
                  </span>
                  <code className={styles.codeValue}>{b.ticketCode}</code>
                  <div className={styles.pdfActions}>
                    <button
                      type="button"
                      className={styles.pdfLink}
                      onClick={pdf.download}
                      disabled={pdfDisabled}
                      aria-busy={pdf.busy === 'download'}
                    >
                      {pdf.busy === 'download'
                        ? <IconLoader2 size={13} stroke={1.5} className={styles.pdfSpinner} aria-hidden="true" />
                        : <IconDownload size={13} stroke={1.5} aria-hidden="true" />}
                      {pdf.busy === 'download' ? t.ticketPdf.preparing : t.ticketPdf.download}
                    </button>
                    {shareSupported && (
                      <button
                        type="button"
                        className={styles.pdfLink}
                        onClick={pdf.share}
                        disabled={pdfDisabled}
                        aria-busy={pdf.busy === 'share'}
                      >
                        {pdf.busy === 'share'
                          ? <IconLoader2 size={13} stroke={1.5} className={styles.pdfSpinner} aria-hidden="true" />
                          : <IconShare2 size={13} stroke={1.5} aria-hidden="true" />}
                        {pdf.busy === 'share' ? t.ticketPdf.preparing : t.ticketPdf.share}
                      </button>
                    )}
                  </div>
                  {showPdfHint && <p className={styles.pdfHint}>{t.ticketPdf.iosHint}</p>}
                  {pdfErrorText && <p className={styles.pdfError} role="alert">{pdfErrorText}</p>}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}

export function StampBadge({ booking: b, isFR }: { booking: Booking; isFR: boolean }) {
  const payStatus = b.paymentStatus ?? 'not_paid';
  const status    = b.status;

  let rotation = 'rotate(4deg)';
  if (payStatus === 'expired')                                         rotation = 'rotate(2deg)';
  else if (status === 'cancelled')                                     rotation = 'rotate(-5deg)';
  else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') rotation = 'rotate(0deg)';
  else if (payStatus === 'awaiting_transfer' || status === 'pending')  rotation = 'rotate(-3deg)';

  let stampClass: string;
  let label: string;

  if (status === 'cancelled' || payStatus === 'expired') {
    stampClass = styles.stampMuted;
    label = isFR ? 'ANNULÉ' : 'ОТМЕНЕНО';
  } else if (payStatus === 'awaiting_transfer') {
    stampClass = styles.stampAmber;
    label = isFR ? 'EN ATTENTE' : 'ОЖИДАЕТ ОПЛАТЫ';
  } else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') {
    stampClass = styles.stampAmber;
    label = isFR ? 'SUR PLACE' : 'ОПЛАТА НА МЕСТЕ';
  } else {
    stampClass = styles.stampGreen;
    label = isFR ? 'CONFIRMÉ' : 'ПОДТВЕРЖДЕНО';
  }

  return (
    <span className={`${styles.stamp} ${stampClass}`} style={{ transform: rotation }}>
      {label}
    </span>
  );
}
