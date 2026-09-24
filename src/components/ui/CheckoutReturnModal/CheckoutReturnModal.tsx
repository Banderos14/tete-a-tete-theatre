// Возврат со Stripe Checkout: «проверяем оплату», «оплата получена»,
// «оплата не завершена».
//
// Адрес возврата (?checkout=success|cancelled&booking=…) ничего не доказывает.
// Экран показывает бронь такой, какой её записал сервер: подписка на брони
// зрителя обновится, как только webhook Stripe подтвердит оплату. Пока этого
// нет — «проверяем», затем (после ограниченного ожидания) честное
// «платёж обрабатывается». Клиент статус оплаты не пишет никогда.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  IconAlertTriangle, IconCircleCheck, IconCircleX, IconClock, IconLoader2, IconLogin,
} from '@tabler/icons-react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { subscribeToUserBookings, resumeCheckoutViaApi } from '../../../services/bookingService';
import type { BookingApiError } from '../../../services/bookingService';
import type { Booking } from '../../../types/booking';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import {
  checkoutReturnView, startCheckoutWait, checkoutRedirectUrl, redirectToCheckout,
  holdUntilMs, formatHoldTime,
  type CheckoutReturn, type CheckoutReturnView, type ServerCheckoutState,
} from '../../../utils/onlinePayment';
import styles from './CheckoutReturnModal.module.scss';

interface Props {
  checkout:      CheckoutReturn;
  onClose:       () => void;
  onOpenTickets: () => void;
  onRequireAuth: () => void;
}

type View = CheckoutReturnView | 'signin';

const ICONS: Record<View, ReactElement> = {
  checking:      <IconLoader2 className={styles.spin} size={28} stroke={1.5} />,
  paid:          <IconCircleCheck size={28} stroke={1.5} />,
  processing:    <IconClock size={28} stroke={1.5} />,
  not_completed: <IconClock size={28} stroke={1.5} />,
  inactive:      <IconCircleX size={28} stroke={1.5} />,
  issue:         <IconAlertTriangle size={28} stroke={1.5} />,
  not_found:     <IconCircleX size={28} stroke={1.5} />,
  signin:        <IconLogin size={28} stroke={1.5} />,
};

export function CheckoutReturnModal({ checkout, onClose, onOpenTickets, onRequireAuth }: Props) {
  const { t, lang } = useLang();
  const { user, loading: authLoading } = useAuth();

  // null — брони ещё не пришли из Firestore.
  const [bookings,      setBookings]      = useState<Booking[] | null>(null);
  const [timedOut,      setTimedOut]      = useState(false);
  const [serverState,   setServerState]   = useState<ServerCheckoutState | null>(null);
  const [waitRound,     setWaitRound]     = useState(0);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError,   setResumeError]   = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalA11y(true, onClose, dialogRef);

  // Та же подписка, что у кабинета: бронь обновится, как только webhook запишет оплату.
  useEffect(() => {
    if (!user) return;
    return subscribeToUserBookings(user.uid, setBookings, () => setBookings([]));
  }, [user]);

  const booking = bookings?.find(b => b.id === checkout.bookingId);
  const view: View = !user
    ? (authLoading ? 'checking' : 'signin')
    : checkoutReturnView(checkout.kind, booking, { loaded: bookings !== null, timedOut, serverState });
  const settled = view !== 'checking';

  // Ограниченное ожидание только после успешной оплаты: несколько сверок через
  // сервер (он сам спросит Stripe) и таймаут. Останавливается при размонтировании
  // и как только состояние стало окончательным.
  useEffect(() => {
    if (checkout.kind !== 'success' || !user || settled) return;
    return startCheckoutWait({
      sync: async () => {
        try {
          const res = await resumeCheckoutViaApi(checkout.bookingId, await user.getIdToken());
          setServerState(res.checkoutState);
        } catch (err) {
          if ((err as BookingApiError)?.reason === 'checkout_expired') setServerState('expired');
        }
      },
      onTimeout: () => setTimedOut(true),
    });
  }, [checkout.kind, checkout.bookingId, user, settled, waitRound]);

  function retryWait() {
    setTimedOut(false);
    setServerState(null);
    setWaitRound(n => n + 1);
  }

  async function handleResume() {
    if (!user || resumeLoading) return;
    setResumeLoading(true);
    setResumeError('');
    try {
      const res = await resumeCheckoutViaApi(checkout.bookingId, await user.getIdToken());
      const url = checkoutRedirectUrl(res);
      if (url) { redirectToCheckout(url); return; }
      setServerState(res.checkoutState);
      setResumeLoading(false);
    } catch (err) {
      setResumeLoading(false);
      if ((err as BookingApiError)?.reason === 'checkout_expired') {
        setServerState('expired');
        setResumeError(t.payment.checkoutExpired);
      } else {
        setResumeError(t.payment.resumeError);
      }
    }
  }

  const p = t.payment;
  const holdTime = booking ? formatHoldTime(holdUntilMs(booking), lang) : null;
  const copy: Record<View, { title: string; text: string }> = {
    checking:      { title: p.checkingTitle,     text: p.checkingText },
    paid:          { title: p.paidTitle,         text: p.paidText },
    processing:    { title: p.processingTitle,   text: p.processingText },
    not_completed: { title: p.notCompletedTitle, text: p.notCompletedText(holdTime) },
    inactive:      { title: p.inactiveTitle,     text: p.inactiveText },
    issue:         { title: p.issueTitle,        text: p.issue },
    not_found:     { title: p.notFoundTitle,     text: p.notFoundText },
    signin:        { title: p.signInTitle,       text: p.signInText },
  };
  const tone = view === 'paid' ? styles.tonePaid
    : view === 'issue' || view === 'inactive' || view === 'not_found' ? styles.toneBad
    : styles.toneWait;

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-return-title"
      >
        <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>

        <div className={styles.status} aria-live="polite">
          <span className={`${styles.icon} ${tone}`} aria-hidden="true">{ICONS[view]}</span>
          <h2 id="checkout-return-title" className={styles.title}>{copy[view].title}</h2>
          <p className={styles.text}>{copy[view].text}</p>
        </div>

        {booking && (
          <dl className={styles.summary}>
            <div className={styles.summaryRow}>
              <dt>{p.summaryShow}</dt>
              <dd>{localizedShowTitle(booking, lang)}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{p.summaryDate}</dt>
              <dd>{booking.showDate} · {booking.showTime}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t.booking.labelAmount}</dt>
              <dd className={styles.amount}>{booking.totalAmount}&nbsp;€</dd>
            </div>
          </dl>
        )}

        {resumeError && <p className={styles.error} role="alert">{resumeError}</p>}

        <div className={styles.actions}>
          {view === 'signin' && (
            <button type="button" className={styles.primaryBtn} onClick={onRequireAuth}>{p.signIn}</button>
          )}
          {view === 'not_completed' && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleResume}
              disabled={resumeLoading}
              aria-busy={resumeLoading}
            >
              {resumeLoading ? p.redirecting : p.resume}
            </button>
          )}
          {view === 'processing' && (
            <button type="button" className={styles.primaryBtn} onClick={retryWait}>{p.refresh}</button>
          )}
          {(view === 'paid' || view === 'issue' || view === 'not_found') && (
            <button type="button" className={styles.primaryBtn} onClick={onOpenTickets}>{t.booking.myTickets}</button>
          )}
          {(view === 'processing' || view === 'not_completed') && (
            <button type="button" className={styles.secondaryBtn} onClick={onOpenTickets}>{t.booking.myTickets}</button>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>{t.booking.close}</button>
        </div>
      </div>
    </div>
  );
}
