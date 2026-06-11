import { useEffect, useRef, useState } from 'react';
import { generateTicketQR } from '../../../services/qrService';
import { generateTicketPdf } from '../../../services/ticketPdfService';
import { useLang } from '../../../i18n/LangContext';
import type { Booking } from '../../../types/booking';
import styles from './TicketCard.module.scss';

interface Props {
  booking: Booking;
  isExpanded: boolean;
  onToggle: () => void;
}

// 25-bar decorative barcode — uniform height, varying width
const STUB_BARCODE_WIDTHS = [2,1,3,1,1,2,1,4,1,2,1,3,1,1,2,1,3,2,1,4,1,2,1,1,3] as const;

const MONTH_FR_MAP: Record<string, string> = {
  'Янв': 'Jan', 'Фев': 'Fév', 'Мар': 'Mar', 'Апр': 'Avr',
  'Май': 'Mai', 'Июн': 'Juin', 'Июл': 'Juil', 'Авг': 'Août',
  'Сен': 'Sep', 'Окт': 'Oct', 'Ноя': 'Nov', 'Дек': 'Déc',
};

function parseShowDate(showDate: string, isFR: boolean): { day: string; monthAbbrev: string } {
  const parts = showDate.trim().split(/\s+/);
  const day = parts[0] ?? '—';
  const monthRu = parts[1] ?? '';
  const monthAbbrev = isFR
    ? (MONTH_FR_MAP[monthRu] ?? monthRu.toLowerCase())
    : monthRu.toLowerCase();
  return { day, monthAbbrev };
}

function getStubVariant(b: Booking): 'burgundy' | 'amber' | 'grey' {
  const payStatus = b.paymentStatus ?? 'not_paid';
  if (b.status === 'cancelled' || payStatus === 'expired') return 'grey';
  if (payStatus === 'paid') return 'burgundy';
  if (payStatus === 'awaiting_transfer') return 'amber';
  if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') return 'amber';
  return 'burgundy';
}

export function TicketCard({ booking: b, isExpanded, onToggle }: Props) {
  const { lang } = useLang();
  const [qrSrc,      setQrSrc]      = useState('');
  const [qrLoaded,   setQrLoaded]   = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (!isExpanded || fetched.current) return;
    fetched.current = true;
    generateTicketQR(b.ticketCode)
      .then(src => { setQrSrc(src); setQrLoaded(true); })
      .catch(() => { setQrLoaded(true); });
  }, [b.ticketCode, isExpanded]);

  async function handleDownloadPdf() {
    if (!qrSrc || pdfLoading) return;
    setPdfLoading(true);
    try { await generateTicketPdf(b, qrSrc, lang); }
    finally { setPdfLoading(false); }
  }

  const isFR       = lang === 'FR';
  const stubVariant = getStubVariant(b);
  const payStatus  = b.paymentStatus ?? 'not_paid';

  const { day, monthAbbrev } = parseShowDate(b.showDate, isFR);
  const timeLabel = `${monthAbbrev} · ${b.showTime}`;

  const ticketTypeLabel =
    b.ticketType === 'student'
      ? (isFR ? 'Étudiant' : 'Студент')
      : (isFR ? 'Standard' : 'Стандарт');

  // CTA text changes between collapsed / expanded
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
            <p className={styles.showTitle}>{b.showTitle}</p>
            <StampBadge booking={b} isFR={isFR} />
          </div>

          {/* Row 2: composition */}
          <p className={styles.compositionLine}>
            <span className={styles.compositionCount}>{b.ticketsCount} × {ticketTypeLabel}</span>
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
                {isFR ? "À présenter à l'entrée" : 'Предъявите при входе'}
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
                  <button
                    type="button"
                    className={styles.pdfLink}
                    onClick={handleDownloadPdf}
                    disabled={!qrSrc || pdfLoading}
                  >
                    <DownloadIcon />
                    {pdfLoading ? '…' : (isFR ? 'Télécharger PDF' : 'Скачать PDF')}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}

// ── Status stamp ──────────────────────────────────────────────────────────────

export function StampBadge({ booking: b, isFR }: { booking: Booking; isFR: boolean }) {
  const payStatus = b.paymentStatus ?? 'not_paid';
  const status    = b.status;

  let rotation = 'rotate(4deg)';
  if (payStatus === 'expired')                                         rotation = 'rotate(2deg)';
  else if (status === 'cancelled')                                     rotation = 'rotate(-6deg)';
  else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') rotation = 'rotate(7deg)';
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

// ── Icons ─────────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  );
}
