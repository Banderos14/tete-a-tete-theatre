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
    try {
      await generateTicketPdf(b, qrSrc);
    } finally {
      setPdfLoading(false);
    }
  }

  const isFR = lang === 'FR';

  return (
    <div className={`${styles.ticket} ${isExpanded ? styles.expanded : ''}`}>

      {/* ── Collapsed header ─────────────────────────────────────────────── */}
      <div
        className={styles.header}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <div className={styles.headerLeft}>
          <p className={styles.showTitle}>{b.showTitle}</p>
          <p className={styles.showMeta}>{b.showDate} · {b.showTime}</p>
          <code className={styles.ticketCode}>{b.ticketCode}</code>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.statusBadge} ${b.paymentStatus === 'paid' ? styles.paid : styles.confirmed}`}>
            {b.paymentStatus === 'paid'
              ? (isFR ? 'Payé' : 'Оплачено')
              : (isFR ? 'Confirmé' : 'Подтверждено')}
          </span>
          <div className={`${styles.qrBtn} ${isExpanded ? styles.qrBtnOpen : ''}`}>
            <QrIcon />
            <span>{isExpanded ? (isFR ? 'Masquer' : 'Скрыть') : 'QR'}</span>
            <svg
              className={`${styles.chevron} ${isExpanded ? styles.chevronUp : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              width="10" height="10" aria-hidden
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Expanded body ─────────────────────────────────────────────────── */}
      <div className={`${styles.body} ${isExpanded ? styles.bodyExpanded : ''}`} aria-hidden={!isExpanded}>
        <div className={styles.bodyInner}>

            {/* QR column */}
            <div className={styles.qrCol}>
              <div className={styles.qrWrap}>
                {qrSrc
                  ? <img className={styles.qrImg} src={qrSrc} alt="QR" />
                  : <div className={`${styles.qrImg} ${qrLoaded ? styles.qrError : styles.qrLoading}`} />
                }
              </div>
              <p className={styles.qrHint}>
                {isFR ? "Présentez à l'entrée" : 'Предъявите при входе'}
              </p>
            </div>

            {/* Details column */}
            <div className={styles.details}>
              <p className={styles.detailTitle}>{b.showTitle}</p>
              <p className={styles.detailVenue}>Théâtre Tête-à-Tête</p>
              <dl className={styles.detailList}>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Date'     : 'Дата'   }</dt>
                  <dd>{b.showDate}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Heure'    : 'Время'  }</dt>
                  <dd>{b.showTime}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Lieu'     : 'Адрес'  }</dt>
                  <dd>24 Rue Rossini, Nice</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>{isFR ? 'Billets'  : 'Билеты' }</dt>
                  <dd>{b.ticketsCount}{b.totalAmount > 0 && ` · ${b.totalAmount} €`}</dd>
                </div>
              </dl>
              <div className={styles.codeBox}>
                <span className={styles.codeLabel}>Code</span>
                <code className={styles.codeValue}>{b.ticketCode}</code>
              </div>

              {/* PDF download */}
              <button
                type="button"
                className={styles.pdfBtn}
                onClick={handleDownloadPdf}
                disabled={!qrSrc || pdfLoading}
              >
                <DownloadIcon />
                {pdfLoading
                  ? '…'
                  : (isFR ? 'Télécharger PDF' : 'Скачать PDF')}
              </button>
            </div>

          </div>
        </div>
      </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function QrIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2zM18 14h3M14 18h2M18 18h3v3M18 18v2"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  );
}
