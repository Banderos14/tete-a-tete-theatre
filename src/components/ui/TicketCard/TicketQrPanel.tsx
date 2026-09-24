// QR-билет: картинка QR, код брони и «Скачать PDF» / «Поделиться».
//
// Один блок на все карточки кабинета: оплаченный билет, оплата на месте и
// бронь с ещё не полученным переводом показывают ОДИН и тот же QR (код брони →
// ticketQrPayload), а PDF собирается из той же картинки. Статус оплаты рядом
// подписан отдельно — неоплаченный билет не выглядит оплаченным.

import { useEffect, useRef, useState } from 'react';
import { IconDownload, IconLoader2, IconShare2 } from '@tabler/icons-react';
import { generateTicketQR } from '../../../services/qrService';
import { canShareFiles } from '../../../services/ticketPdfService';
import { useLang } from '../../../i18n/LangContext';
import type { Booking } from '../../../types/booking';
import { useTicketPdf } from './useTicketPdf';
import { bookingBreakdown, isMixedBooking } from '../../../utils/ticketBreakdown';
import styles from './TicketCard.module.scss';

/** Подпись под QR, если билет ещё не оплачен. */
function paymentNote(b: Booking, isFR: boolean): string | null {
  const pay = b.paymentStatus ?? 'not_paid';
  if (pay === 'awaiting_transfer') {
    return isFR
      ? 'Virement pas encore reçu. Le billet reste valable : à défaut, le paiement se fait à l’entrée.'
      : 'Перевод ещё не получен. Билет действует: если не успеете, оплату примут на входе.';
  }
  if (pay === 'not_paid') {
    return isFR ? 'Paiement sur place, à l’entrée.' : 'Оплата на месте, при входе.';
  }
  return null;
}

/** active — QR строится при первом показе, а не при каждом рендере списка. */
export function TicketQrPanel({ booking: b, active }: { booking: Booking; active: boolean }) {
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
    if (!active || fetched.current) return;
    fetched.current = true;
    generateTicketQR(b.ticketCode)
      .then(src => { setQrSrc(src); setQrLoaded(true); })
      .catch(() => { setQrLoaded(true); });
  }, [b.ticketCode, active]);

  const isFR        = lang === 'FR';
  const payNote     = paymentNote(b, isFR);
  const pdfDisabled = !qrSrc || pdf.busy !== null;
  const showPdfHint = pdf.openedInPreview || (shareSupported && coarsePointer);
  const pdfErrorText =
    pdf.error === 'share'           ? t.ticketPdf.errorShare :
    pdf.error === 'preview-blocked' ? t.ticketPdf.errorPreviewBlocked :
    pdf.error === 'generate'        ? t.ticketPdf.errorGenerate : '';

  return (
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
            ? "Présentez ce QR code au personnel du théâtre à l'entrée"
            : 'Покажите этот QR-код сотруднику театра при входе'}
        </p>
        {payNote && <p className={styles.qrPayNote}>{payNote}</p>}
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
            <dt>{isFR ? 'Places' : 'Мест'   }</dt>
            <dd>{b.seatsCount && b.seatsCount > 0 ? b.seatsCount : b.ticketsCount}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>{isFR ? 'Billets' : 'Билеты' }</dt>
            <dd>
              {b.ticketsCount}
              {b.totalAmount > 0 && (
                <> · <span>{b.totalAmount} €</span></>
              )}
              {/* Несколько тарифов — состав отдельной строкой. */}
              {isMixedBooking(b) && <><br />{bookingBreakdown(b, lang === 'FR' ? 'FR' : 'RU')}</>}
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
  );
}
