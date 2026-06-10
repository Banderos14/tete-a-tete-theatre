import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { createBooking, subscribeToUserBookings } from '../../../services/bookingService';
import { generateTicketCode } from '../../../services/ticketService';
import { sendBookingConfirmationEmail } from '../../../services/emailService';
import { mapAuthError, isPopupClosedError, isEmailInUseError } from '../../../utils/authErrors';
import { PAYMENT_CONFIG, getPaymentAccount, formatIban, normalizeIban } from '../../../config/payment';
import {
  hasAvailableLoyaltyReward,
  calculateLoyaltyDiscount,
  getUserAttendedCount,
} from '../../../services/loyaltyService';
import type { Show, TicketType } from '../../../types';
import type { Booking, PaymentMethod } from '../../../types/booking';
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
  const [copiedDetails,    setCopiedDetails]    = useState(false);
  const [copiedCode,       setCopiedCode]       = useState(false);
  const [copiedIban,       setCopiedIban]       = useState(false);
  const [copiedRawIban,    setCopiedRawIban]    = useState(false);
  const [copiedBic,        setCopiedBic]        = useState(false);
  const [copiedCard,       setCopiedCard]       = useState(false);
  const [copiedRef,        setCopiedRef]        = useState(false);

  const [userBookings,       setUserBookings]       = useState<Booking[]>([]);
  const [savedOriginalAmount,setSavedOriginalAmount] = useState(0);
  const [savedDiscountAmount,setSavedDiscountAmount] = useState(0);

  const defaultTicket = useMemo(
    () => (show?.ticketTypes?.length ? show.ticketTypes[0] : null),
    [show],
  );

  const activeTicket  = selectedTicket ?? defaultTicket;
  const baseAmount    = (activeTicket?.price ?? 0) * tickets;
  const maxTickets    = activeTicket?.available ?? 10;

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
    setSubmitLoading(true); setSubmitError('');
    try {
      const code     = generateTicketCode();
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
          originalAmount:        baseAmount,
          loyaltyDiscountApplied: true,
          loyaltyDiscountAmount:  discountAmount,
        } : {}),
      }).catch(() => {/* silently ignored */});

      setTicketCode(code);
      setSavedAmount(totalAmount);
      setSavedOriginalAmount(loyaltyAvailable ? baseAmount : 0);
      setSavedDiscountAmount(loyaltyAvailable ? discountAmount : 0);
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
  const ticketLabel = (id: string | undefined) =>
    id === 'standard' ? t.admin.ticketStandard :
    id === 'student'  ? t.admin.ticketStudent  : (id ?? '');

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
            {/* Show preview strip */}
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

        {/* ── Form step — two-column layout ── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className={styles.formLayout}>

            {/* LEFT: show info + ticket selection */}
            <div className={styles.formLeft}>
              {/* Show header */}
              <div className={styles.showHeader} style={{ background: show.palette }}>
                <span className={styles.showGlyph}>{show.glyph}</span>
                <div>
                  <p className={styles.showTitle}>{showTitle}</p>
                  <p className={styles.showMeta}>{show.day} {monthLabel} {show.year} · {show.time}</p>
                </div>
              </div>

              {/* Ticket type */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t.booking.ticketType}</div>
                <div className={styles.ticketTypes}>
                  {show.ticketTypes.map(tt => (
                    <button
                      key={tt.id}
                      type="button"
                      className={`${styles.ticketTypeBtn} ${activeTicket?.id === tt.id ? styles.ticketTypeActive : ''}`}
                      onClick={() => { setSelectedTicket(tt); setTickets(1); }}
                    >
                      <div className={styles.ttLeft}>
                        <span className={styles.ttName}>{ticketLabel(tt.id)}</span>
                        <span className={styles.ttSeats}>{t.booking.seatsLeft}: {tt.available}</span>
                      </div>
                      <div className={styles.ttDivider} />
                      <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity + total */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t.booking.tickets}</div>
                <div className={styles.qtyRow}>
                  <div className={styles.counter}>
                    <button
                      type="button"
                      onClick={() => setTickets(v => Math.max(1, v - 1))}
                      disabled={tickets <= 1}
                    >−</button>
                    <span>{tickets}</span>
                    <button
                      type="button"
                      onClick={() => setTickets(v => Math.min(maxTickets, v + 1))}
                      disabled={tickets >= maxTickets}
                    >+</button>
                  </div>
                  {activeTicket && (
                    <div className={styles.totalBox}>
                      <span className={styles.totalLabel}>{t.booking.total}</span>
                      <span className={styles.totalAmount}>{totalAmount}&nbsp;€</span>
                    </div>
                  )}
                </div>
                {activeTicket && !loyaltyAvailable && (
                  <p className={styles.priceHint}>
                    {activeTicket.price}&nbsp;€ × {tickets} = {totalAmount}&nbsp;€
                  </p>
                )}
                {activeTicket && loyaltyAvailable && (
                  <div className={styles.loyaltyBlock}>
                    <p className={styles.loyaltyTitle}>{t.booking.loyaltyGift}</p>
                    <div className={styles.loyaltyRow}>
                      <span>{t.booking.loyaltyOriginal}</span>
                      <span className={styles.loyaltyStrike}>{baseAmount}&nbsp;€</span>
                    </div>
                    <div className={styles.loyaltyRow}>
                      <span>{t.booking.loyaltyDiscount}</span>
                      <span>−{discountAmount}&nbsp;€</span>
                    </div>
                    <div className={`${styles.loyaltyRow} ${styles.loyaltyRowTotal}`}>
                      <span>{t.booking.loyaltyTotal}</span>
                      <span>{totalAmount}&nbsp;€</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: contact + payment + submit */}
            <div className={styles.formRight}>
              {/* Header */}
              <div className={styles.formRightHeader}>
                <div className={styles.formRightLabel}>
                  {lang === 'FR' ? 'RÉSERVATION' : 'БРОНИРОВАНИЕ'}
                </div>
                <p className={styles.formRightShowTitle}>{showTitle}</p>
              </div>

              {/* Phone */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor="bk-phone">{t.booking.phone}</label>
                <input
                  id="bk-phone" className={styles.input} type="tel"
                  inputMode="tel"
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="+33 6 00 00 00 00"
                />
              </div>

              {/* Payment */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t.booking.paymentMethod}</div>
                <div className={styles.paymentCards}>
                  <button
                    type="button"
                    className={`${styles.paymentCard} ${payment === 'on_site' ? styles.paymentCardActive : ''}`}
                    onClick={() => setPayment('on_site')}
                  >
                    <span className={styles.paymentIcon}>🏠</span>
                    <div>
                      <div className={styles.paymentName}>{t.booking.payOnSite}</div>
                      <div className={styles.paymentDesc}>{t.booking.payOnSiteDesc}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`${styles.paymentCard} ${payment === 'bank_transfer' ? styles.paymentCardActive : ''}`}
                    onClick={() => setPayment('bank_transfer')}
                  >
                    <span className={styles.paymentIcon}>🏦</span>
                    <div>
                      <div className={styles.paymentName}>{t.booking.payTransfer}</div>
                      <div className={styles.paymentDesc}>{t.booking.payTransferDesc}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Comment */}
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor="bk-comment">{t.booking.comment}</label>
                <textarea
                  id="bk-comment" className={styles.textarea}
                  value={comment} onChange={e => setComment(e.target.value)}
                  placeholder={t.booking.commentPlaceholder} rows={3}
                />
              </div>

              {submitError && <p className={styles.error}>{submitError}</p>}

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitLoading || !activeTicket}
              >
                {submitLoading ? '…' : t.booking.submit}
                {!submitLoading && <span className={styles.submitArrow}>→</span>}
              </button>
            </div>
          </form>
        )}

        {/* ── Success step ── */}
        {step === 'success' && (() => {
          const paymentRef  = `${PAYMENT_CONFIG.paymentReferencePrefix}-${ticketCode}`;
          const account     = getPaymentAccount(undefined);
          const isIban      = account.type === 'iban';
          const copyRows: string[] = [
            `${t.booking.transferReceiver}: ${account.receiverName}`,
            ...(account.bankName ? [`${lang === 'FR' ? 'Banque' : 'Банк'}: ${account.bankName}`] : []),
            ...(isIban
              ? [
                  `IBAN: ${formatIban(account.iban)}`,
                  `${t.booking.ibanNoSpacesLabel}: ${normalizeIban(account.iban)}`,
                  `BIC / SWIFT: ${account.bic}`,
                ]
              : [`${lang === 'FR' ? 'Numéro de carte' : 'Номер карты'}: ${account.cardNumber}`]
            ),
            `${t.booking.successAmount}: ${savedAmount} €`,
            `${t.booking.transferPurpose}: ${paymentRef}`,
          ];
          const detailsText = copyRows.join('\n');

          return (
            <div className={styles.successWrap}>
              <div className={styles.successLeft} style={{ background: show.palette }}>
                <span className={styles.successGlyph}>{show.glyph}</span>
                <div className={styles.successCheckWrap}>
                  <div className={styles.successIcon}>✓</div>
                </div>
              </div>

              <div className={styles.successRight}>
                <h3 className={styles.successTitle}>{t.booking.successTitle}</h3>

                {/* Booking summary */}
                <div className={styles.infoBox}>
                  {([
                    [t.booking.labelShow,    showTitle],
                    [t.booking.labelDate,    `${show.day} ${monthLabel} ${show.year} · ${show.time}`],
                    [t.booking.labelTickets, `${tickets} × ${ticketLabel(activeTicket?.id)}`],
                    ...(savedDiscountAmount > 0 ? [
                      [t.booking.loyaltyOriginal, `${savedOriginalAmount} €`],
                      [t.booking.loyaltyDiscount, `−${savedDiscountAmount} €`],
                      [t.booking.loyaltyTotal,    `${savedAmount} €`],
                    ] : [
                      [t.booking.labelAmount, `${savedAmount} €`],
                    ]),
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className={styles.infoBoxRow}>
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Ticket code */}
                <div className={styles.ticketCodeBox}>
                  <span className={styles.ticketCodeLabel}>{lang === 'FR' ? 'Code de réservation' : 'Код брони'}</span>
                  <div className={styles.ticketCodeRow}>
                    <code className={styles.ticketCodeValue}>{ticketCode}</code>
                    <button
                      className={`${styles.copyBtn} ${copiedCode ? styles.copyBtnDone : ''}`}
                      onClick={() => copyToClipboard(ticketCode, setCopiedCode)}
                    >
                      {copiedCode ? t.booking.copied : t.booking.copyCode}
                    </button>
                  </div>
                </div>

                {payment === 'on_site' ? (
                  <p className={styles.successText}>{t.booking.successOnSite}</p>
                ) : (
                  <>
                    <p className={styles.successText}>{t.booking.successTransfer}</p>

                    <div className={styles.transferBox}>
                      {/* Amount row */}
                      <div className={styles.transferRow}>
                        <span>{t.booking.successAmount}</span>
                        <strong>{savedAmount}&nbsp;€</strong>
                      </div>

                      {/* Bank details with individual copy buttons */}
                      <div className={styles.transferDetails}>
                        <p className={styles.transferDetailLabel}>
                          {account.label} · {account.description}
                        </p>

                        <div className={styles.transferFieldRow}>
                          <div>
                            <span>{t.booking.transferReceiver}: </span>
                            <strong>{account.receiverName}</strong>
                          </div>
                        </div>

                        {account.bankName && (
                          <div className={styles.transferFieldRow}>
                            <div>
                              <span>{lang === 'FR' ? 'Banque' : 'Банк'}: </span>
                              <strong>{account.bankName}</strong>
                            </div>
                          </div>
                        )}

                        {isIban ? (
                          <>
                            <div className={styles.transferFieldRow}>
                              <div>
                                <span>IBAN: </span>
                                <strong>{formatIban(account.iban)}</strong>
                              </div>
                              <div className={styles.ibanCopyBtns}>
                                <button
                                  className={`${styles.copyBtn} ${copiedIban ? styles.copyBtnDone : ''}`}
                                  onClick={() => copyToClipboard(formatIban(account.iban), setCopiedIban)}
                                >
                                  {copiedIban ? t.booking.copied : t.booking.copyIban}
                                </button>
                                <button
                                  className={`${styles.copyBtn} ${copiedRawIban ? styles.copyBtnDone : ''}`}
                                  onClick={() => copyToClipboard(normalizeIban(account.iban), setCopiedRawIban)}
                                >
                                  {copiedRawIban ? t.booking.copied : t.booking.copyRawIban}
                                </button>
                              </div>
                            </div>
                            <p className={styles.ibanHint}>{t.booking.ibanNoSpacesHint}</p>

                            <div className={styles.transferFieldRow}>
                              <div>
                                <span>BIC / SWIFT: </span>
                                <strong>{account.bic}</strong>
                              </div>
                              <button
                                className={`${styles.copyBtn} ${copiedBic ? styles.copyBtnDone : ''}`}
                                onClick={() => copyToClipboard(account.bic, setCopiedBic)}
                              >
                                {copiedBic ? t.booking.copied : (lang === 'FR' ? 'Copier' : 'Копировать')}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className={styles.transferFieldRow}>
                            <div>
                              <span>{lang === 'FR' ? 'Numéro de carte' : 'Номер карты'}: </span>
                              <strong>{account.cardNumber}</strong>
                            </div>
                            <button
                              className={`${styles.copyBtn} ${copiedCard ? styles.copyBtnDone : ''}`}
                              onClick={() => copyToClipboard(account.cardNumber, setCopiedCard)}
                            >
                              {copiedCard ? t.booking.copied : (lang === 'FR' ? 'Copier' : 'Копировать')}
                            </button>
                          </div>
                        )}

                        <div className={styles.transferFieldRow}>
                          <div>
                            <span>{t.booking.transferPurpose}: </span>
                            <strong>{paymentRef}</strong>
                          </div>
                          <button
                            className={`${styles.copyBtn} ${copiedRef ? styles.copyBtnDone : ''}`}
                            onClick={() => copyToClipboard(paymentRef, setCopiedRef)}
                          >
                            {copiedRef ? t.booking.copied : (lang === 'FR' ? 'Copier' : 'Копировать')}
                          </button>
                        </div>
                      </div>

                      {/* Copy all */}
                      <button
                        className={`${styles.copyBtn} ${styles.copyBtnWide} ${copiedDetails ? styles.copyBtnDone : ''}`}
                        onClick={() => copyToClipboard(detailsText, setCopiedDetails)}
                      >
                        {copiedDetails ? t.booking.copied : t.booking.copyDetails}
                      </button>

                      {/* Pending confirmation warning */}
                      <p className={styles.transferPendingNote}>
                        ⚠&nbsp;
                        {lang === 'FR'
                          ? 'Votre réservation sera confirmée uniquement après vérification du virement bancaire.'
                          : 'Ваша бронь будет подтверждена только после проверки банковского перевода.'}
                      </p>
                    </div>
                  </>
                )}

                <p className={styles.successEmail}>
                  {t.booking.successEmailHint} <strong>{userEmail}</strong>
                </p>

                <button className={styles.closeSuccessBtn} onClick={onClose}>
                  {t.booking.close}
                </button>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
