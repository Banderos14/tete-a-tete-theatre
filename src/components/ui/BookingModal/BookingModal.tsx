import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { createBooking, subscribeToUserBookings, subscribeToShowBookedSeats } from '../../../services/bookingService';
import { generateTicketCode } from '../../../services/ticketService';
import { sendBookingConfirmationEmail } from '../../../services/emailService';
import { mapAuthError, isPopupClosedError, isEmailInUseError } from '../../../utils/authErrors';
import { PAYMENT_CONFIG } from '../../../config/payment';
import { THEATRE_CAPACITY } from '../../../config/theatre';
import {
  hasAvailableLoyaltyReward,
  calculateLoyaltyDiscount,
  getUserAttendedCount,
} from '../../../services/loyaltyService';
import type { Show, TicketType } from '../../../types';
import type { Booking, PaymentMethod } from '../../../types/booking';
import { BookingFormStep } from './BookingFormStep';
import { BookingSuccessStep } from './BookingSuccessStep';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
}

function formatPhone(raw: string): string {
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return hasPlus ? '+' : '';
  if (hasPlus && digits.startsWith('33')) {
    const local = digits.slice(2);
    let out = '+33';
    if (!local) return out;
    out += ' ' + local[0];
    for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
    return out;
  }
  if (hasPlus) {
    const country = digits.slice(0, 2);
    const rest = digits.slice(2);
    let out = '+' + country;
    for (let i = 0; i < rest.length; i += 2) out += ' ' + rest.slice(i, i + 2);
    return out;
  }
  return digits;
}

type Step = 'auth' | 'form' | 'success';

export function BookingModal({ show, onClose }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const initialStep = (): Step => (user ? 'form' : 'auth');

  const [step,         setStep]         = useState<Step>(initialStep);
  const [authTab,      setAuthTab]      = useState<'signIn' | 'signUp'>('signIn');
  const [authName,     setAuthName]     = useState('');
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError,    setAuthError]    = useState('');
  const [authLoading,  setAuthLoading]  = useState(false);

  const [tickets,          setTickets]          = useState(1);
  const [selectedTicket,   setSelectedTicket]   = useState<TicketType | null>(null);
  const [payment,          setPayment]          = useState<PaymentMethod>('on_site');
  const [phone,            setPhone]            = useState('');
  const [comment,          setComment]          = useState('');
  const [submitLoading,    setSubmitLoading]    = useState(false);
  const [submitError,      setSubmitError]      = useState('');
  const [ticketCode,       setTicketCode]       = useState('');
  const [savedAmount,      setSavedAmount]      = useState(0);
  const [copiedCode,       setCopiedCode]       = useState(false);
  const [bookedSeats,      setBookedSeats]      = useState(0);

  const [userBookings, setUserBookings] = useState<Booking[]>([]);

  const defaultTicket = useMemo(
    () => (show?.ticketTypes?.length ? show.ticketTypes[0] : null),
    [show],
  );

  const activeTicket   = selectedTicket ?? defaultTicket;
  const baseAmount     = (activeTicket?.price ?? 0) * tickets;
  const availableSeats = Math.max(0, THEATRE_CAPACITY - bookedSeats);
  const maxTickets     = Math.min(activeTicket?.available ?? 10, availableSeats || 1);

  const loyaltyAvailable = useMemo(
    () => hasAvailableLoyaltyReward(userBookings),
    [userBookings],
  );
  const attendedCount = useMemo(
    () => getUserAttendedCount(userBookings),
    [userBookings],
  );
  const discountAmount = loyaltyAvailable ? calculateLoyaltyDiscount(baseAmount) : 0;
  const totalAmount    = baseAmount - discountAmount;

  // Realtime subscription — обновляет loyalty reward без refresh.
  // Запускается только пока модалка открыта (show != null), чистится при закрытии.
  useEffect(() => {
    if (!user || !show) return;
    return subscribeToUserBookings(user.uid, setUserBookings, () => {});
  }, [user?.uid, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription — остаток мест для текущего спектакля.
  useEffect(() => {
    if (!show) return;
    return subscribeToShowBookedSeats(show.id, setBookedSeats);
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp tickets count to availableSeats when capacity changes.
  useEffect(() => {
    if (availableSeats >= 1 && tickets > availableSeats) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTickets(availableSeats);
    }
  }, [availableSeats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Переходим на форму сразу после авторизации, не дожидаясь следующего рендера
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user && step === 'auth') setStep('form');
  }, [user, step]);

  useEffect(() => {
    // Подставляем телефон из профиля, если он сохранён
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userProfile?.phone) setPhone(userProfile.phone);
  }, [userProfile]);

  useEffect(() => {
    // Сбрасываем все поля при открытии для нового спектакля
    if (!show) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setStep(user ? 'form' : 'auth');
    setTickets(1); setSelectedTicket(null); setPayment('on_site');
    setComment(''); setSubmitError('');
    setAuthEmail(''); setAuthPassword(''); setAuthName(''); setAuthError('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden';
    else      document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  async function handleGoogle() {
    setAuthLoading(true); setAuthError('');
    try { await signInWithGoogle(); }
    catch (e) {
      if (isPopupClosedError(e)) { setAuthLoading(false); return; }
      setAuthError(mapAuthError(e, t.auth.errors));
    } finally { setAuthLoading(false); }
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault(); setAuthLoading(true); setAuthError('');
    try {
      if (authTab === 'signIn') await signInWithEmail(authEmail, authPassword);
      else                      await signUpWithEmail(authEmail, authPassword, authName);
    } catch (e) {
      // Email exists during signup → switch to login tab; authEmail is already filled
      if (authTab === 'signUp' && isEmailInUseError(e)) setAuthTab('signIn');
      setAuthError(mapAuthError(e, t.auth.errors));
    } finally { setAuthLoading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !activeTicket || !show) return;
    if (availableSeats < tickets) {
      setSubmitError(t.booking.soldOut);
      return;
    }
    setSubmitLoading(true); setSubmitError('');
    try {
      const code      = generateTicketCode();
      const userName  = user.displayName ?? userProfile?.displayName ?? '';
      const userEmail = user.email ?? userProfile?.email ?? '';
      const showDate  = `${show.day} ${show.month} ${show.year}`;

      const isBankTransfer   = payment === 'bank_transfer';
      const paymentExpiresAt = isBankTransfer
        ? Timestamp.fromDate(new Date(Date.now() + PAYMENT_CONFIG.paymentExpiryHours * 60 * 60 * 1000))
        : undefined;
      const paymentReference = isBankTransfer
        ? `${PAYMENT_CONFIG.paymentReferencePrefix}-${code}`
        : undefined;

      const priceInfo = loyaltyAvailable
        ? `${activeTicket.label} · ${activeTicket.price}€ × ${tickets} = ${baseAmount}€, скидка 50% = ${totalAmount}€`
        : `${activeTicket.label} · ${activeTicket.price}€ × ${tickets} = ${totalAmount}€`;

      await createBooking({
        showId:        show.id,
        showTitle:     show.title,
        showDate,
        showTime:      show.time,
        userId:        user.uid,
        userName,
        userEmail,
        userPhone:     phone,
        ticketsCount:  tickets,
        ticketType:    activeTicket.id,
        priceInfo,
        totalAmount,
        ticketCode:    code,
        status:        'pending',
        paymentMethod: payment,
        paymentStatus: isBankTransfer ? 'awaiting_transfer' : 'not_paid',
        comment,
        lang,
        ...(isBankTransfer ? { paymentAccountId: PAYMENT_CONFIG.paymentAccounts[0].id } : {}),
        ...(paymentReference ? { paymentReference } : {}),
        ...(paymentExpiresAt ? { paymentExpiresAt } : {}),
        ...(loyaltyAvailable ? {
          originalAmount:                  baseAmount,
          loyaltyDiscountApplied:          true,
          loyaltyDiscountAmount:           discountAmount,
          loyaltyRewardUsedFromVisitCount: attendedCount,
        } : {}),
      });

      // Non-blocking — booking is already saved if email fails
      sendBookingConfirmationEmail({
        userEmail,
        userName,
        showTitle:        show.title,
        showTitleFR:      show.titleFR,
        showDate,
        showTime:         show.time,
        ticketsCount:     tickets,
        ticketType:       activeTicket.id,
        totalAmount,
        ticketCode:       code,
        paymentMethod:    payment,
        paymentAccountId: isBankTransfer ? PAYMENT_CONFIG.paymentAccounts[0].id : undefined,
        lang,
        ...(loyaltyAvailable ? {
          originalAmount:         baseAmount,
          loyaltyDiscountApplied: true,
          loyaltyDiscountAmount:  discountAmount,
        } : {}),
      }).catch(() => {/* silently ignored */});

      setTicketCode(code);
      setSavedAmount(totalAmount);
      setStep('success');
    } catch {
      setSubmitError(t.booking.submitError);
    } finally { setSubmitLoading(false); }
  }

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* clipboard not available */});
  }

  const userEmail   = user?.email ?? userProfile?.email ?? '';
  const showTitle   = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const monthLabel  = t.months[show.month] ?? show.month;

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">

        <button className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* ── Auth step — centered single column ── */}
        {step === 'auth' && (
          <div className={styles.authWrap}>
            <div className={styles.authShowStrip} style={{ background: show.palette }}>
              <span className={styles.authGlyph}>{show.glyph}</span>
              <div>
                <p className={styles.authShowTitle}>{showTitle}</p>
                <p className={styles.authShowMeta}>{show.day} {monthLabel} · {show.time}</p>
              </div>
            </div>

            <div className={styles.authBody}>
              <h3 className={styles.authTitle}>
                {lang === 'FR' ? 'Connectez-vous pour\nréserver un billet' : 'Войдите, чтобы\nзабронировать билет'}
              </h3>
              <p className={styles.authHint}>{t.booking.loginRequired}</p>

              <button className={styles.googleBtn} onClick={handleGoogle} disabled={authLoading}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <div className={styles.divider}><span>{t.auth.orDivider}</span></div>

              <div className={styles.authTabs}>
                <button
                  className={authTab === 'signIn' ? styles.authTabActive : ''}
                  onClick={() => { setAuthTab('signIn'); setAuthError(''); }}
                >{t.auth.signIn}</button>
                <button
                  className={authTab === 'signUp' ? styles.authTabActive : ''}
                  onClick={() => { setAuthTab('signUp'); setAuthError(''); }}
                >{t.auth.signUp}</button>
              </div>

              <form onSubmit={handleAuth} className={styles.authForm}>
                {authTab === 'signUp' && (
                  <input
                    className={styles.input}
                    type="text" value={authName} placeholder={t.auth.nameLabel}
                    onChange={e => setAuthName(e.target.value)} required disabled={authLoading}
                  />
                )}
                <input
                  className={styles.input}
                  type="email" value={authEmail} placeholder={t.auth.emailLabel}
                  onChange={e => setAuthEmail(e.target.value)} required disabled={authLoading}
                />
                <input
                  className={styles.input}
                  type="password" value={authPassword} placeholder={t.auth.passwordLabel}
                  onChange={e => setAuthPassword(e.target.value)} required disabled={authLoading}
                />
                {authError && <p className={styles.error}>{authError}</p>}
                <button type="submit" className={styles.submitBtn} disabled={authLoading}>
                  {authLoading ? '…' : authTab === 'signIn' ? t.auth.signIn : t.auth.register}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Form step ── */}
        {step === 'form' && (
          <BookingFormStep
            show={show}
            lang={lang}
            t={t}
            tickets={tickets}
            selectedTicket={selectedTicket}
            payment={payment}
            phone={phone}
            comment={comment}
            submitLoading={submitLoading}
            submitError={submitError}
            activeTicket={activeTicket}
            baseAmount={baseAmount}
            totalAmount={totalAmount}
            discountAmount={discountAmount}
            loyaltyAvailable={loyaltyAvailable}
            maxTickets={maxTickets}
            availableSeats={availableSeats}
            onTicketsChange={setTickets}
            onSelectedTicketChange={tt => { setSelectedTicket(tt); setTickets(1); }}
            onPaymentChange={setPayment}
            onPhoneChange={v => setPhone(formatPhone(v))}
            onCommentChange={setComment}
            onSubmit={handleSubmit}
          />
        )}

        {/* ── Success step ── */}
        {step === 'success' && (
          <BookingSuccessStep
            show={show}
            lang={lang}
            t={t}
            tickets={tickets}
            activeTicket={activeTicket}
            savedAmount={savedAmount}
            ticketCode={ticketCode}
            payment={payment}
            userEmail={userEmail}
            copiedCode={copiedCode}
            onCopyCode={() => copyToClipboard(ticketCode, setCopiedCode)}
            onClose={onClose}
          />
        )}

      </div>
    </div>
  );
}
