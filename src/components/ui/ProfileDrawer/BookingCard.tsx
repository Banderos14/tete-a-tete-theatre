// Карточка брони без QR: отменённые, ожидающие оплаты и протухшие.
// Билет с QR рисует TicketCard — сюда попадает всё остальное.

import { useState } from 'react';
import { useLang } from '../../../i18n/LangContext';
import type { T } from '../../../i18n/translations';
import type { Booking, BookingStatus } from '../../../types/booking';
import { cancelBookingByUser, hoursUntilExpiry, resumeCheckoutForCurrentUser } from '../../../services/bookingService';
import type { BookingApiError } from '../../../services/bookingService';
import {
  onlineBookingState, canResumeCheckout, checkoutRedirectUrl, redirectToCheckout,
  holdUntilMs, formatHoldTime,
} from '../../../utils/onlinePayment';
import { computedIsAttended } from '../../../services/attendanceService';
import { parseShowStartUtcMs } from '../../../../shared/domain/showTime';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import { PAYMENT_CONFIG, getPaymentAccount } from '../../../config/payment';
import { STUB_BARCODE_WIDTHS, parseShowDateParts, getStubVariant, type StubVariant } from '../../../utils/ticketStub';
import { bookingBreakdown } from '../../../utils/ticketBreakdown';
import { StampBadge, TicketQrPanel } from '../TicketCard';
import styles from './ProfileDrawer.module.scss';

const STUB_STYLE: Record<StubVariant, string> = {
  burgundy: styles.bookingStubBurgundy,
  amber:    styles.bookingStubAmber,
  grey:     styles.bookingStubGrey,
};

/** У бордового корешка месяц красится базовым классом — отдельного ему не нужно. */
const STUB_MONTH_STYLE: Record<StubVariant, string> = {
  burgundy: '',
  amber:    styles.bookingStubMonthAmber,
  grey:     styles.bookingStubMonthGrey,
};

export function BookingCard({ booking: b, t, isDismissing = false, onStartDismiss, onCancelDismiss }: {
  booking: Booking;
  t: T;
  isDismissing?: boolean;
  onStartDismiss: (id: string) => void;
  onCancelDismiss: (id: string) => void;
}) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelComment, setCancelComment] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState('');
  const [qrOpen,        setQrOpen]        = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError,   setResumeError]   = useState('');

  const isAttended     = computedIsAttended(b);
  const displayStatus: BookingStatus = isAttended ? 'attended' : b.status;

  const payStatus = b.paymentStatus ?? 'not_paid';
  const isAwaitingTransfer = payStatus === 'awaiting_transfer';
  const isExpiredTransfer  = payStatus === 'expired';
  const isCancelled        = b.status === 'cancelled';
  // Онлайн-оплата: состояние целиком из брони, которую пишет сервер (webhook).
  const online             = onlineBookingState(b);
  const isAwaitingOnline   = online === 'awaiting';
  const onlineMoneyNote    = online === 'refund_pending' ? t.payment.refundPending
    : online === 'refunded' ? t.payment.refunded
    : online === 'issue'    ? t.payment.issue
    : null;

  // Отмена зрителем: нельзя отменить посещённую, уже отменённую и ОПЛАЧЕННУЮ бронь
  // (оплата окончательна, автоматических возвратов в системе нет), а также бронь
  // на спектакль, который уже начался. Те же правила дублируются на сервере
  // в /api/cancel-booking — здесь они лишь убирают заведомо нерабочую кнопку.
  // Date.now() нельзя дёргать прямо в рендере — фиксируем момент один раз при монтировании
  // карточки. Точности «спектакль уже начался» этого достаточно: кабинет открывают заново,
  // а окончательное решение всё равно принимает сервер.
  const [mountedAtMs] = useState(() => Date.now());
  const showStartMs = parseShowStartUtcMs(b.showDate, b.showTime);
  const showStarted = showStartMs !== null && showStartMs <= mountedAtMs;
  const canCancel =
    !isAttended && !isCancelled && b.status !== 'attended' &&
    payStatus !== 'paid' && !showStarted;

  // Обратный отсчёт считаем только пока бронь ждёт оплаты.
  // Останавливаем при: cancelled, expired paymentStatus или в анимации dismiss.
  const hoursLeft = (isAwaitingTransfer && !isCancelled && !isDismissing)
    ? hoursUntilExpiry(b)
    : null;
  const paymentRef = b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`;
  const account    = getPaymentAccount(b.paymentAccountId);

  const stubVariant = getStubVariant(b);
  const { day, monthAbbrev } = parseShowDateParts(b.showDate, isFR);
  const timeLabel = `${monthAbbrev} · ${b.showTime}`;

  // Состав: «2 × Обычный» или «2 × Обычный, 2 × Ученик / студент».
  const composition = bookingBreakdown(b, isFR ? 'FR' : 'RU');

  let actionText = '';
  let actionClass = styles.bookingActionMuted;
  if (payStatus === 'paid' && b.status === 'confirmed') {
    actionText = isFR ? 'Montrer à l\'entrée →' : 'Показать на входе →';
  } else if (isAwaitingTransfer) {
    actionText = isFR ? 'Détails du virement →' : 'Реквизиты для перевода →';
    actionClass = styles.bookingActionAmber;
  } else if (isAwaitingOnline) {
    actionText = t.payment.actionAwaiting;
    actionClass = styles.bookingActionAmber;
  } else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid' && !isCancelled) {
    actionText = isFR ? 'Paiement sur place' : 'Оплата на месте';
    actionClass = styles.bookingActionAmber;
  }

  const reasonOptions = [
    { value: 'time',    label: t.booking.cancelReasonTime    },
    { value: 'plans',   label: t.booking.cancelReasonPlans   },
    { value: 'mistake', label: t.booking.cancelReasonMistake },
    { value: 'other',   label: t.booking.cancelReasonOther   },
  ];

  // «Продолжить оплату»: адрес сессии даёт сервер (resume_checkout), клиент его
  // не строит и не хранит. Оплату по-прежнему подтверждает только webhook.
  async function handleResume() {
    if (resumeLoading) return;
    setResumeLoading(true);
    setResumeError('');
    try {
      const res = await resumeCheckoutForCurrentUser(b.id);
      const url = checkoutRedirectUrl(res);
      if (url) { redirectToCheckout(url); return; }
      // 'paid' / 'processing': сервер сверился со Stripe, карточку обновит подписка.
      setResumeLoading(false);
    } catch (err) {
      setResumeLoading(false);
      setResumeError((err as BookingApiError)?.reason === 'checkout_expired'
        ? t.payment.checkoutExpired
        : t.payment.resumeError);
    }
  }

  async function handleCancelSubmit() {
    if (!cancelReason) { setCancelError(t.booking.cancelReasonRequired); return; }
    setCancelLoading(true);
    setCancelError('');
    onStartDismiss(b.id);
    try {
      await cancelBookingByUser(b.id, cancelReason, cancelComment || undefined);
      setCancelOpen(false);
    } catch {
      onCancelDismiss(b.id);
      setCancelError(isFR ? 'Erreur lors de l\'annulation.' : 'Ошибка при отмене. Попробуйте ещё раз.');
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className={`${styles.bookingCard} ${displayStatus === 'cancelled' ? styles.bookingCardCancelled : ''}`}>
      {/* ── Mini-ticket row ── */}
      <div className={styles.bookingTicketRow}>

        {/* LEFT STUB */}
        <div className={`${styles.bookingStub} ${STUB_STYLE[stubVariant]}`}>
          <div className={styles.bookingStubDay}>{day}</div>
          <div className={`${styles.bookingStubMonth} ${STUB_MONTH_STYLE[stubVariant]}`}>{timeLabel}</div>
          <div className={styles.bookingStubBarcode} aria-hidden="true">
            {STUB_BARCODE_WIDTHS.map((w, i) => (
              <div key={i} style={{ width: `${w}px` }} />
            ))}
          </div>
          <div className={styles.bookingStubCutoutTop} aria-hidden="true" />
          <div className={styles.bookingStubCutoutBottom} aria-hidden="true" />
        </div>

        {/* RIGHT CONTENT */}
        <div className={styles.bookingCardContent}>
          {/* Row 1: title + stamp */}
          <div className={styles.bookingCardTop}>
            <span className={styles.bookingShowTitle}>{localizedShowTitle(b, lang)}</span>
            <StampBadge booking={b} isFR={isFR} />
          </div>

          {/* Row 2: composition line */}
          <p className={styles.bookingCompositionLine}>
            <span>{composition}</span>
            {b.totalAmount > 0 && (
              <>
                <span className={styles.bookingCompositionSep}> · </span>
                <span className={styles.bookingCompositionAmount}>{b.totalAmount} €</span>
              </>
            )}
          </p>

          {/* Row 3: code + action */}
          <div className={styles.bookingCardRow3}>
            {/* До онлайн-оплаты и после возврата код брони не показываем: билета нет. */}
            {b.ticketCode && !isAwaitingOnline && !onlineMoneyNote && (
              <code className={styles.bookingCode}>{b.ticketCode}</code>
            )}
            {/* Countdown for awaiting transfers */}
            {hoursLeft !== null && (
              <span className={hoursLeft <= 0 ? styles.countdownExpired : styles.countdownHours}>
                {hoursLeft <= 0
                  ? (isFR ? 'Expiré' : 'Истёкло')
                  : `${hoursLeft} ${isFR ? 'h' : 'ч.'}`}
              </span>
            )}
            {actionText && (
              <span className={`${styles.bookingActionText} ${actionClass}`}>{actionText}</span>
            )}
          </div>

          {/* QR-билет есть и до получения перевода — тот же, что в письме.
              Статус «ожидает оплаты» показывает штамп карточки. */}
          {isAwaitingTransfer && !isCancelled && b.ticketCode && (
            <>
              <button
                type="button"
                className={styles.bookingQrToggle}
                onClick={() => setQrOpen(v => !v)}
                aria-expanded={qrOpen}
              >
                {qrOpen
                  ? (isFR ? 'Masquer le billet QR ↑' : 'Скрыть QR-билет ↑')
                  : (isFR ? 'Afficher le billet QR →' : 'Показать QR-билет →')}
              </button>
              {qrOpen && (
                <div className={styles.bookingQrPanel}>
                  <TicketQrPanel booking={b} active />
                </div>
              )}
            </>
          )}

          {/* Transfer details block — only for awaiting_transfer */}
          {isAwaitingTransfer && b.ticketCode && (
            <div className={styles.transferMiniBox}>
              <p className={styles.transferMiniLabel}>
                {`${account.label} · ${account.description}`}
              </p>
              <dl className={styles.transferMiniList}>
                <div className={styles.transferMiniRow}>
                  <dt>{isFR ? 'Bénéficiaire' : 'Получатель'}</dt>
                  <dd>{account.receiverName}</dd>
                </div>
                {account.bankName && (
                  <div className={styles.transferMiniRow}>
                    <dt>{isFR ? 'Banque' : 'Банк'}</dt>
                    <dd>{account.bankName}</dd>
                  </div>
                )}
                {account.type === 'iban' ? (
                  <>
                    <div className={styles.transferMiniRow}>
                      <dt>IBAN</dt>
                      <dd>{account.iban}</dd>
                    </div>
                    <div className={styles.transferMiniRow}>
                      <dt>BIC / SWIFT</dt>
                      <dd>{account.bic}</dd>
                    </div>
                  </>
                ) : (
                  <div className={styles.transferMiniRow}>
                    <dt>{isFR ? 'Numéro de carte' : 'Номер карты'}</dt>
                    <dd>{account.cardNumber}</dd>
                  </div>
                )}
                <div className={`${styles.transferMiniRow} ${styles.transferMiniRowRef}`}>
                  <dt>{isFR ? 'Référence' : 'Назначение'}</dt>
                  <dd><strong>{paymentRef}</strong></dd>
                </div>
              </dl>
            </div>
          )}

          {/* Онлайн-оплата не завершена: места удержаны до срока сессии Stripe. */}
          {isAwaitingOnline && (
            <p className={styles.bookingNoteWait}>
              {(() => {
                const time = formatHoldTime(holdUntilMs(b), isFR ? 'FR' : 'RU');
                return time ? t.payment.awaitingNote(time) : t.payment.awaitingNoteNoTime;
              })()}
            </p>
          )}
          {canResumeCheckout(b) && (
            <>
              <button
                type="button"
                className={styles.resumePaymentBtn}
                onClick={handleResume}
                disabled={resumeLoading}
                aria-busy={resumeLoading}
              >
                {resumeLoading ? t.payment.redirecting : t.payment.resume}
              </button>
              {resumeError && <p className={styles.cancelDialogError} role="alert">{resumeError}</p>}
            </>
          )}
          {onlineMoneyNote && (
            <p className={online === 'issue' ? styles.bookingNoteWait : styles.bookingNoteBad}>{onlineMoneyNote}</p>
          )}

          {/* Notes. Посещённая бронь сюда не попадает: у неё displayStatus === 'attended'. */}
          {displayStatus === 'confirmed' && (
            <p className={styles.bookingNoteOk}>{t.profile.bookingNoteConfirmed}</p>
          )}
          {!isAttended && isExpiredTransfer && (
            <p className={styles.bookingNoteBad}>{t.profile.bookingNoteExpired}</p>
          )}
          {displayStatus === 'cancelled' && !isExpiredTransfer && !onlineMoneyNote && (
            <p className={styles.bookingNoteBad}>{t.profile.bookingNoteCancelled}</p>
          )}
          {payStatus === 'paid' && displayStatus === 'pending' && (
            <p className={styles.bookingNoteOk}>{t.profile.bookingNotePaid}</p>
          )}

          {/* Cancel button — only for active bookings */}
          {canCancel && !cancelOpen && (
            <button
              type="button"
              className={styles.cancelBookingBtn}
              onClick={() => { setCancelOpen(true); setCancelReason(''); setCancelComment(''); setCancelError(''); }}
            >
              {t.booking.cancelBooking}
            </button>
          )}

          {/* Inline cancel reason dialog */}
          {cancelOpen && (
            <div className={styles.cancelDialog}>
              <p className={styles.cancelDialogTitle}>{t.booking.cancelBookingTitle}</p>
              <p className={styles.cancelDialogText}>{t.booking.cancelBookingText}</p>
              <div className={styles.cancelReasonList}>
                {reasonOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.cancelReasonBtn} ${cancelReason === opt.value ? styles.cancelReasonActive : ''}`}
                    onClick={() => setCancelReason(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {cancelReason === 'other' && (
                <textarea
                  className={styles.cancelCommentArea}
                  value={cancelComment}
                  onChange={e => setCancelComment(e.target.value)}
                  placeholder={t.booking.cancelCommentPlaceholder}
                  aria-label={t.booking.cancelCommentPlaceholder}
                  rows={2}
                />
              )}
              {cancelError && <p className={styles.cancelDialogError}>{cancelError}</p>}
              <div className={styles.cancelDialogActions}>
                <button
                  type="button"
                  className={styles.cancelDialogConfirm}
                  onClick={handleCancelSubmit}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? '…' : t.booking.cancelConfirm}
                </button>
                <button
                  type="button"
                  className={styles.cancelDialogAbort}
                  onClick={() => setCancelOpen(false)}
                  disabled={cancelLoading}
                >
                  {isFR ? 'Retour' : 'Назад'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
