import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { createBooking, subscribeToUserBookings, subscribeToShowBookedSeats } from '../../../services/bookingService';
import { generateTicketCode } from '../../../services/ticketService';
import { sendBookingConfirmationEmail } from '../../../services/emailService';
import { mapAuthError, isPopupClosedError, isEmailInUseError } from '../../../utils/authErrors';
import { formatPhone, isValidPhone } from '../../../utils/phone';
import { PAYMENT_CONFIG } from '../../../config/payment';
import { THEATRE_CAPACITY } from '../../../config/theatre';
import {
  hasAvailableLoyaltyReward,
  calculateLoyaltyDiscount,
  getUserAttendedCount,
} from '../../../services/loyaltyService';
import type { Show, TicketType } from '../../../types';
import type { Booking, PaymentMethod, BookingStatus, PaymentStatus } from '../../../types/booking';
import { BookingFormStep } from './BookingFormStep';
import { BookingSuccessStep } from './BookingSuccessStep';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
}

type Step = 'auth' | 'form' | 'success';

export function BookingModal({ show, onClose }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, loading: authContextLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, saveProfile } = useAuth();

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
  const [phoneError,       setPhoneError]       = useState('');
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

  // Ограничиваем количество билетов при изменении доступных мест.
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
    setComment(''); setSubmitError(''); setPhoneError('');
    setAuthEmail(''); setAuthPassword(''); setAuthName(''); setAuthError('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useScrollLock(!!show);

  // Дополнительный non-passive listener прямо на оверлее — ловит события,
  // которые могли не всплыть из-за stopPropagation в дочерних элементах.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !show) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onMove  = (e: TouchEvent) => {
      const allowEl = (e.target as Element | null)
        ?.closest('[data-scroll-lock-allow]') as HTMLElement | null;
      if (!allowEl) { e.preventDefault(); return; }
      const dy       = (e.touches[0]?.clientY ?? 0) - startY;
      const atTop    = allowEl.scrollTop <= 0;
      const atBottom = allowEl.scrollTop >= allowEl.scrollHeight - allowEl.clientHeight - 1;
      if (dy > 0 && atTop)    { e.preventDefault(); return; }
      if (dy < 0 && atBottom) { e.preventDefault(); return; }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
    };
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
      // Email уже занят при регистрации → переключаем на вкладку входа (authEmail уже заполнен)
      if (authTab === 'signUp' && isEmailInUseError(e)) setAuthTab('signIn');
      setAuthError(mapAuthError(e, t.auth.errors));
    } finally { setAuthLoading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !activeTicket || !show || authContextLoading) return;
    if (availableSeats < tickets) {
      setSubmitError(t.booking.soldOut);
      return;
    }

    // Телефон должен быть форматированным (начинается с +, ≥10 цифр).
    // formatPhone уже вызывается на каждом keystroke; здесь ловим голые цифры вроде '75688587880'.
    if (!isValidPhone(phone)) {
      setPhoneError(t.profile.phoneInvalid);
      return;
    }

    setSubmitLoading(true); setSubmitError(''); setPhoneError('');
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

      const bookingPayload = {
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
        status:        'pending' as BookingStatus,
        paymentMethod: payment,
        paymentStatus: (isBankTransfer ? 'awaiting_transfer' : 'not_paid') as PaymentStatus,
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
      };

      await createBooking(bookingPayload);

      // Не блокируем — бронь уже сохранена, провал email её не затронет.
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
      }).catch(() => {/* email failure must never affect a saved booking */});

      setTicketCode(code);
      setSavedAmount(totalAmount);
      setStep('success');

      // Синхронизируем телефон в профиль если он там пустой (не блокируем).
      // Бронь уже сохранена — сбой обновления профиля не должен её затронуть.
      if (phone && !userProfile?.phone) {
        saveProfile({ phone }).catch(e => console.warn('[booking] phone sync to profile failed', e));
      }
    } catch (err) {
      const fe = err as { code?: string; message?: string; stack?: string };
      console.error('[BookingModal] createBooking failed', {
        errorCode:       fe?.code,
        errorMessage:    fe?.message,
        errorStack:      fe?.stack,
        uid:             user?.uid,
        email:           user?.email ?? null,
        showId:          show?.id,
        showDate:        show ? `${show.day} ${show.month} ${show.year}` : null,
        showTime:        show?.time,
        ticketType:      activeTicket?.id,
        ticketsCount:    tickets,
        phoneRaw:        phone,
        phoneValid:      isValidPhone(phone),
        paymentMethod:   payment,
        totalAmount,
        isAuthenticated: !!user,
        userDocPresent:  !!userProfile,
        userDocPhone:    userProfile?.phone ?? null,
        bookedSeats,
        availableSeats,
      });
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
      ref={overlayRef}
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">

        <button className={styles.closeBtn} onClick={onClose} aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Auth */}
        {step === 'auth' && (
          <div className={styles.authWrap} data-scroll-lock-allow="true">
            <div className={styles.authShowStrip} style={{ background: show.palette }}>
              <div className={styles.authGlyph} style={{ background: show.palette }} />
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
                    aria-label={t.auth.nameLabel}
                    onChange={e => setAuthName(e.target.value)} required disabled={authLoading}
                    autoComplete="name"
                  />
                )}
                <input
                  className={styles.input}
                  type="email" value={authEmail} placeholder={t.auth.emailLabel}
                  aria-label={t.auth.emailLabel}
                  onChange={e => setAuthEmail(e.target.value)} required disabled={authLoading}
                  autoComplete="email"
                />
                <input
                  className={styles.input}
                  type="password" value={authPassword} placeholder={t.auth.passwordLabel}
                  aria-label={t.auth.passwordLabel}
                  onChange={e => setAuthPassword(e.target.value)} required disabled={authLoading}
                  autoComplete={authTab === 'signIn' ? 'current-password' : 'new-password'}
                />
                {authError && <p className={styles.error}>{authError}</p>}
                <button type="submit" className={styles.submitBtn} disabled={authLoading}>
                  {authLoading ? '…' : authTab === 'signIn' ? t.auth.signIn : t.auth.register}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Форма */}
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
            onPhoneChange={v => { setPhone(formatPhone(v)); setPhoneError(''); }}
            phoneError={phoneError}
            onCommentChange={setComment}
            onSubmit={handleSubmit}
          />
        )}

        {/* Успех */}
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
