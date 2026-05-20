import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { createBooking } from '../../../services/bookingService';
import type { Show, TicketType } from '../../../types';
import type { PaymentMethod } from '../../../types/booking';
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

function mapFirebaseError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email':        'Неверный формат email',
    'auth/wrong-password':       'Неверный пароль',
    'auth/invalid-credential':   'Неверный email или пароль',
    'auth/email-already-in-use': 'Этот email уже используется',
    'auth/weak-password':        'Минимум 6 символов',
    'auth/user-not-found':       'Пользователь не найден',
    'auth/too-many-requests':    'Слишком много попыток — подождите',
  };
  return map[code] ?? 'Ошибка, попробуйте снова';
}

export function BookingModal({ show, onClose }: Props) {
  const { t } = useLang();
  const { user, userProfile, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const initialStep = (): Step => (user ? 'form' : 'auth');

  const [step,         setStep]         = useState<Step>(initialStep);
  const [authTab,      setAuthTab]      = useState<'signIn' | 'signUp'>('signIn');
  const [authName,     setAuthName]     = useState('');
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError,    setAuthError]    = useState('');
  const [authLoading,  setAuthLoading]  = useState(false);

  const [tickets,       setTickets]       = useState(1);
  const [selectedTicket,setSelectedTicket]= useState<TicketType | null>(null);
  const [payment,       setPayment]       = useState<PaymentMethod>('on_site');
  const [phone,         setPhone]         = useState('');
  const [comment,       setComment]       = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError,   setSubmitError]   = useState('');

  const defaultTicket = useMemo(
    () => (show?.ticketTypes?.length ? show.ticketTypes[0] : null),
    [show],
  );

  const activeTicket = selectedTicket ?? defaultTicket;
  const totalAmount  = (activeTicket?.price ?? 0) * tickets;
  const maxTickets   = activeTicket?.available ?? 10;

  useEffect(() => {
    if (user && step === 'auth') setStep('form');
  }, [user, step]);

  useEffect(() => {
    if (userProfile?.phone) setPhone(userProfile.phone);
  }, [userProfile]);

  useEffect(() => {
    if (!show) return;
    setStep(user ? 'form' : 'auth');
    setTickets(1); setSelectedTicket(null); setPayment('on_site');
    setComment(''); setSubmitError('');
    setAuthEmail(''); setAuthPassword(''); setAuthName(''); setAuthError('');
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden';
    else      document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  // ── Auth handlers ───────────────────────────────────────────────────────────

  async function handleGoogle() {
    setAuthLoading(true); setAuthError('');
    try { await signInWithGoogle(); }
    catch (e) {
      if (e instanceof FirebaseError) setAuthError(mapFirebaseError(e.code));
      else setAuthError('Ошибка входа через Google');
    } finally { setAuthLoading(false); }
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault(); setAuthLoading(true); setAuthError('');
    try {
      if (authTab === 'signIn') await signInWithEmail(authEmail, authPassword);
      else                      await signUpWithEmail(authEmail, authPassword, authName);
    } catch (e) {
      if (e instanceof FirebaseError) setAuthError(mapFirebaseError(e.code));
      else setAuthError('Произошла ошибка');
    } finally { setAuthLoading(false); }
  }

  // ── Booking handler ─────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !activeTicket || !show) return;
    setSubmitLoading(true); setSubmitError('');
    try {
      await createBooking({
        showId:        show.id,
        showTitle:     show.title,
        showDate:      `${show.day} ${show.month} ${show.year}`,
        showTime:      show.time,
        userId:        user.uid,
        userName:      user.displayName ?? userProfile?.displayName ?? '',
        userEmail:     user.email ?? userProfile?.email ?? '',
        userPhone:     phone,
        ticketsCount:  tickets,
        ticketType:    activeTicket.id,
        priceInfo:     `${activeTicket.label} · ${activeTicket.price}€ × ${tickets} = ${totalAmount}€`,
        totalAmount,
        status:        'confirmed',
        paymentMethod: payment,
        paymentStatus: payment === 'bank_transfer' ? 'awaiting_transfer' : 'not_paid',
        comment,
      });
      setStep('success');
    } catch {
      setSubmitError('Не удалось сохранить бронирование. Попробуйте ещё раз.');
    } finally { setSubmitLoading(false); }
  }

  const userEmail = user?.email ?? userProfile?.email ?? '';

  // ── Render ──────────────────────────────────────────────────────────────────

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
                <p className={styles.authShowTitle}>{show.title}</p>
                <p className={styles.authShowMeta}>{show.day} {show.month} · {show.time}</p>
              </div>
            </div>

            <div className={styles.authBody}>
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
                  <p className={styles.showTitle}>{show.title}</p>
                  <p className={styles.showMeta}>{show.day} {show.month} {show.year} · {show.time}</p>
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
                        <span className={styles.ttName}>{tt.label}</span>
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
                {activeTicket && (
                  <p className={styles.priceHint}>
                    {activeTicket.price}&nbsp;€ × {tickets} = {totalAmount}&nbsp;€
                  </p>
                )}
              </div>
            </div>

            {/* RIGHT: contact + payment + submit */}
            <div className={styles.formRight}>
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
        {step === 'success' && (
          <div className={styles.successWrap}>
            <div className={styles.successLeft} style={{ background: show.palette }}>
              <span className={styles.successGlyph}>{show.glyph}</span>
              <div className={styles.successCheckWrap}>
                <div className={styles.successIcon}>✓</div>
              </div>
            </div>

            <div className={styles.successRight}>
              <h3 className={styles.successTitle}>{t.booking.successTitle}</h3>

              {payment === 'on_site' ? (
                <p className={styles.successText}>{t.booking.successOnSite}</p>
              ) : (
                <>
                  <p className={styles.successText}>{t.booking.successTransfer}</p>
                  <div className={styles.transferBox}>
                    <div className={styles.transferRow}>
                      <span>{t.booking.successAmount}</span>
                      <strong>{totalAmount}&nbsp;€</strong>
                    </div>
                    {/* TODO: Замени на реальные реквизиты театра.
                        Для автоматической отправки на email подключи Firebase Functions или EmailJS. */}
                    <div className={styles.transferDetails}>
                      <p className={styles.transferDetailLabel}>{t.booking.transferDetailsLabel}</p>
                      <p>IBAN: <strong>FR76 XXXX XXXX XXXX XXXX XXXX XXX</strong></p>
                      <p>BIC: <strong>XXXXFRXX</strong></p>
                      <p>{t.booking.transferRef}: <strong>{show.title} · {show.day} {show.month}</strong></p>
                    </div>
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
        )}

      </div>
    </div>
  );
}
