import { useState, useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { IconLock, IconCalendarEvent } from '@tabler/icons-react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { subscribeToUserBookings, expireOverdueBookings, hoursUntilExpiry } from '../../../services/bookingService';
import { markEligibleBookingsAsAttended } from '../../../services/attendanceService';
import { PAYMENT_CONFIG, getPaymentAccount } from '../../../config/payment';
import type { Booking, BookingStatus } from '../../../types/booking';
import type { Messenger } from '../../../context/AuthContext';
import styles from './ProfileDrawer.module.scss';

function formatBirthdayDisplay(dateStr: string, lang: 'RU' | 'FR'): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(d);
}

function formatPhone(raw: string): string {
  const hasPlus = raw.startsWith('+');
  const digits  = raw.replace(/\D/g, '');
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
    const rest    = digits.slice(2);
    let out = '+' + country;
    for (let i = 0; i < rest.length; i += 2) out += ' ' + rest.slice(i, i + 2);
    return out;
  }
  return digits;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function mapFbError(err: unknown, lang: 'RU' | 'FR'): string {
  const code = (err as { code?: string })?.code ?? '';
  const isFR = lang === 'FR';
  const map: Record<string, string> = {
    'auth/popup-closed-by-user':        isFR ? 'Fenêtre fermée'                          : 'Окно закрыто',
    'auth/cancelled-popup-request':     isFR ? 'Requête annulée'                         : 'Запрос отменён',
    'auth/operation-not-allowed':       isFR ? 'Facebook non activé dans Firebase'       : 'Facebook не включён в Firebase Console',
    'auth/provider-already-linked':     isFR ? 'Facebook déjà connecté'                  : 'Facebook уже подключён',
    'auth/account-exists-with-different-credential': isFR ? 'Ce compte Facebook est déjà utilisé' : 'Этот аккаунт Facebook уже используется',
    'auth/network-request-failed':      isFR ? 'Erreur réseau'                           : 'Ошибка сети',
  };
  return map[code] ?? (err instanceof Error ? err.message : (isFR ? 'Erreur de connexion' : 'Ошибка подключения'));
}

// Валидация

interface ValidationErrors {
  displayName?: string;
  birthday?:    string;
  phone?:       string;
}

function validate(displayName: string, birthday: string, phone: string, required: string): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!displayName.trim()) errors.displayName = required;
  if (!birthday)           errors.birthday    = required;
  if (!phone.trim())       errors.phone       = required;
  return errors;
}

type Section = 'personal' | 'contacts' | 'socials' | 'notifications' | 'tickets' | 'shows';
const FORM_SECTIONS: Section[] = ['personal', 'contacts', 'socials', 'notifications'];

// Decorative barcode: uniform 16px height, widths vary 1-4px like a real ticket barcode
const BARCODE_WIDTHS = [
  2,1,3,1,1,2,1,4,1,2,1,3,1,1,2,1,3,2,1,4,1,2,1,1,3,1,2,1,4,1,
  1,3,1,2,1,1,4,2,1,3,1,2,1,1,3,1,2,4,1,1,2,1,3,1,2,1,4,1,2,3,
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, loading, logout, saveProfile, linkFacebook } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [birthday,    setBirthday]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [messenger,   setMessenger]   = useState<Messenger>('whatsapp');
  const [socialLink,  setSocialLink]  = useState('');
  const [notify,      setNotify]      = useState(true);

  const [saving,    setSaving]    = useState(false);
  const [savedMsg,  setSavedMsg]  = useState(false);
  const [errors,    setErrors]    = useState<ValidationErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const [isDirty,     setIsDirty]     = useState(false);
  const [warnVisible, setWarnVisible] = useState(false);
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const datePickerRef = useRef<HTMLInputElement>(null);

  const [fbLoading, setFbLoading] = useState(false);
  const [fbError,   setFbError]   = useState('');

  const [bookings,       setBookings]       = useState<Booking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState<string | null>(null);

  const [activeSection,    setActiveSection]    = useState<Section>('personal');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [dismissingIds,    setDismissingIds]    = useState<Set<string>>(new Set());

  // Синхронизация полей формы из Firestore
  useEffect(() => {
    if (!userProfile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(userProfile.displayName || user?.displayName || '');
    setBirthday(userProfile.birthday ?? '');
    setPhone(userProfile.phone ?? '');
    setMessenger(userProfile.phoneMessenger ?? 'whatsapp');
    const social = userProfile.socialLink ?? '';
    // Старый баг: Facebook access token сохранялся как socialLink — чистим.
    const isBadUrl = social.startsWith('https://facebook.com/EAA');
    setSocialLink(isBadUrl ? '' : social);
    if (isBadUrl) saveProfile({ socialLink: '' });
    setNotify(userProfile.notifications ?? true);
    setIsDirty(false);
    setErrors({});
    setSubmitted(false);
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useScrollLock(open);

  // Realtime-подписка на брони пользователя
  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    setHistoryError(null);

    const unsub = subscribeToUserBookings(
      user.uid,
      (data) => {
        setBookings(data);
        setHistoryLoading(false);
        setHistoryError(null);

        markEligibleBookingsAsAttended(data, (id) => {
          setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'attended' } : b));
        }).catch(() => {});

        expireOverdueBookings(data, (id) => {
          setBookings(prev => prev.map(b =>
            b.id === id ? { ...b, paymentStatus: 'expired', status: 'cancelled' } : b,
          ));
        }).catch(() => {});
      },
      (err) => {
        console.error('[ProfileDrawer] Firestore subscription failed:', err);
        setBookings([]);
        setHistoryLoading(false);
        setHistoryError(lang === 'FR'
          ? 'Impossible de charger les billets. Vérifiez votre connexion.'
          : 'Не удалось загрузить билеты. Проверьте доступ к базе.');
      },
    );
    return unsub;
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Сворачиваем раскрытый билет при смене раздела
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedTicketId(null);
  }, [activeSection]);

  useEffect(() => {
    if (submitted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrors(validate(displayName, birthday, phone, t.profile.required));
    }
  }, [displayName, birthday, phone, submitted, t.profile.required]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const startDismiss = useCallback((id: string) => {
    setDismissingIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setDismissingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 580);
  }, []);

  const cancelDismiss = useCallback((id: string) => {
    setDismissingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  function tryClose() {
    if (isDirty) {
      setWarnVisible(true);
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setWarnVisible(false), 2500);
    } else {
      onClose();
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(displayName, birthday, phone, t.profile.required);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.displayName || errs.birthday) setActiveSection('personal');
      else if (errs.phone)                   setActiveSection('contacts');
      return;
    }
    setSaving(true);
    await saveProfile({ displayName, birthday, phone, phoneMessenger: messenger, socialLink, notifications: notify });
    setSaving(false);
    setSavedMsg(true);
    setIsDirty(false);
    setTimeout(() => setSavedMsg(false), 4000);
  }

  function handleBirthdayClick() {
    if (birthdayFromFb || !datePickerRef.current) return;
    try {
      datePickerRef.current.showPicker();
    } catch {
      datePickerRef.current.click();
    }
  }

  const handleLinkFacebook = useCallback(async () => {
    setFbError('');
    setFbLoading(true);
    try {
      const { name, birthday: bd } = await linkFacebook();
      if (name) { setDisplayName(name); markDirty(); }
      if (bd)   { setBirthday(bd);      markDirty(); }
    } catch (err) {
      setFbError(mapFbError(err, lang));
    } finally {
      setFbLoading(false);
    }
  }, [linkFacebook, markDirty, lang]);

  async function handleLogout() {
    onClose();
    await logout();
  }

  const headerName       = displayName || user?.displayName || userProfile?.displayName || '';
  const email            = user?.email ?? userProfile?.email ?? '';
  const photoURL         = user?.photoURL ?? null;
  const fbLinked         = userProfile?.facebookLinked ?? false;
  const birthdayFromFb   = userProfile?.birthdayFromFb ?? false;
  const missingCount     = Object.keys(validate(displayName, birthday, phone, t.profile.required)).length;
  const activeBookings   = bookings.filter(b =>
    !computedIsAttended(b) &&
    b.status !== 'cancelled' &&
    b.paymentStatus !== 'expired'
  );
  const attendedBookings = bookings.filter(computedIsAttended);
  const ticketCount      = activeBookings.filter(b =>
    b.paymentStatus === 'paid' && b.status === 'confirmed' && !!b.ticketCode
  ).length;
  const regYear          = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).getFullYear()
    : null;
  const isGoogleProvider = user?.providerData?.some(p => p.providerId === 'google.com') ?? false;

  const navItems: { id: Section; label: string; badge?: number }[] = [
    { id: 'personal',      label: t.profile.sectionPersonal      },
    { id: 'contacts',      label: t.profile.sectionContacts      },
    { id: 'socials',       label: t.profile.sectionSocials       },
    { id: 'notifications', label: t.profile.sectionNotifications },
    { id: 'tickets',       label: t.profile.history,              badge: ticketCount || undefined },
    { id: 'shows',         label: t.profile.historyAttended      },
  ];

  if (open && loading) {
    return (
      <div className={`${styles.modalWrap} ${styles.modalWrapOpen}`} aria-label="Личный кабинет" aria-modal>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarTop}>
              <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
              <div className={`${styles.skeleton} ${styles.skeletonName}`} />
              <div className={`${styles.skeleton} ${styles.skeletonEmail}`} />
            </div>
          </div>
          <div className={styles.mainContent}>
            <div className={styles.contentScroll}>
              <div className={styles.section}>
                {[1, 2, 3].map(i => (
                  <div key={i} className={styles.skeletonBlock}>
                    <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
                    <div className={`${styles.skeleton} ${styles.skeletonField}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.modalWrap} ${open ? styles.modalWrapOpen : ''}`}
      onClick={tryClose}
      aria-hidden={!open}
    >
      {/* Unsaved toast */}
      {warnVisible && (
        <div className={styles.unsavedToast} onClick={e => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          {t.profile.unsavedWarning}
        </div>
      )}

      {/* Modal */}
      <form
        className={styles.modal}
        onSubmit={handleSave}
        noValidate
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Личный кабинет"
        aria-modal
      >

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={styles.sidebar}>

          {/* Burgundy user card */}
          <div className={styles.sidebarTop}>
            <div className={styles.avatar}>
              {photoURL
                ? <img src={photoURL} alt={headerName} referrerPolicy="no-referrer" />
                : <span>{getInitials(headerName)}</span>
              }
            </div>
            <p className={styles.sidebarName}>{headerName || '—'}</p>
            <p className={styles.sidebarEmail}>{email}</p>
            {regYear !== null && (
              <p className={styles.memberSinceLabel}>{t.profile.memberSince(regYear)}</p>
            )}
            {missingCount > 0 && (
              <div className={styles.incompleteBadge}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {t.profile.incomplete(missingCount)}
              </div>
            )}
            <div className={styles.barcode} aria-hidden="true">
              {BARCODE_WIDTHS.map((w, i) => (
                <div key={i} style={{ width: `${w}px` }} />
              ))}
            </div>
            <div className={styles.cardCutouts} aria-hidden="true" />
          </div>

          {/* Nav */}
          <nav className={styles.sidebarNav}>
            {navItems.map(item => (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge !== undefined && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </button>
            ))}

            {/* Logout — shown inside nav on mobile only */}
            <button
              type="button"
              className={`${styles.navItem} ${styles.navItemLogout}`}
              onClick={handleLogout}
            >
              <span className={styles.navLabel}>{t.profile.logout}</span>
            </button>
          </nav>

          {/* Sidebar footer — logout desktop */}
          <div className={styles.sidebarFooter}>
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              {t.profile.logout} ↗
            </button>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div className={styles.mainContent}>
          <div className={styles.mobileHeader}>
            <div className={styles.mobileIdentity}>
              <div className={styles.mobileAvatar}>
                {photoURL
                  ? <img src={photoURL} alt={headerName} referrerPolicy="no-referrer" />
                  : <span>{getInitials(headerName)}</span>
                }
              </div>
              <div className={styles.mobileIdentityText}>
                <p className={styles.mobileName}>{headerName || '—'}</p>
                <p className={styles.mobileEmail}>{email}</p>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={tryClose}
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Scrollable content area */}
          <div className={styles.contentScroll}>

            {/* ── ЛИЧНЫЕ ДАННЫЕ ── */}
            {activeSection === 'personal' && (
              <div className={styles.section}>
                <div className={styles.personalHeader}>
                  <h2 className={styles.personalTitle}>{t.profile.sectionPersonal}</h2>
                </div>

                <PersonalField
                  label={t.profile.displayName}
                  providerLabel={
                    fbLinked
                      ? (lang === 'FR' ? 'via Facebook' : 'через Facebook')
                      : isGoogleProvider
                        ? (lang === 'FR' ? 'via Google' : 'через Google')
                        : undefined
                  }
                  error={errors.displayName}
                >
                  <input
                    type="text"
                    className={`${styles.personalInput} ${errors.displayName ? styles.personalInputError : ''}`}
                    value={displayName}
                    onChange={e => { setDisplayName(e.target.value); markDirty(); }}
                    placeholder={t.auth.nameLabel}
                    autoComplete="name"
                  />
                </PersonalField>

                <PersonalField
                  label="Email"
                  providerLabel={isGoogleProvider
                    ? (lang === 'FR' ? 'via Google' : 'через Google')
                    : undefined}
                >
                  <div className={styles.emailDisplay}>{email}</div>
                </PersonalField>

                <PersonalField label={t.profile.birthday} error={errors.birthday}>
                  {birthdayFromFb && birthday ? (
                    <div className={`${styles.birthdayField} ${styles.birthdayFieldReadonly}`}>
                      <span className={styles.birthdayText}>
                        {formatBirthdayDisplay(birthday, lang)}
                      </span>
                      <span className={styles.providerTagFb}>
                        <IconLock size={11} stroke={1.5} />
                        Facebook
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`${styles.birthdayField} ${errors.birthday ? styles.birthdayFieldError : ''}`}
                      onClick={handleBirthdayClick}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleBirthdayClick(); }}
                    >
                      <span className={`${styles.birthdayText} ${!birthday ? styles.birthdayPlaceholder : ''}`}>
                        {birthday
                          ? formatBirthdayDisplay(birthday, lang)
                          : (lang === 'FR' ? 'Choisir une date' : 'Выбрать дату')}
                      </span>
                      <IconCalendarEvent size={16} stroke={1.5} className={styles.birthdayIcon} />
                      <input
                        ref={datePickerRef}
                        type="date"
                        value={birthday}
                        onChange={e => { setBirthday(e.target.value); markDirty(); }}
                        className={styles.hiddenDateInput}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                  <p className={styles.birthdayHint}>
                    {lang === 'FR'
                      ? 'Le jour de votre anniversaire — une surprise du théâtre'
                      : 'В день рождения — сюрприз от театра'}
                  </p>
                </PersonalField>
              </div>
            )}

            {/* ── КОНТАКТЫ ── */}
            {activeSection === 'contacts' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.profile.sectionContacts}</h2>

                <Field label={t.profile.phone} error={errors.phone}>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => { setPhone(formatPhone(e.target.value)); markDirty(); }}
                    placeholder="+33 6 00 00 00 00"
                    autoComplete="tel"
                    className={errors.phone ? styles.inputError : ''}
                  />
                </Field>

                <div className={styles.messengerRow}>
                  <span className={styles.messengerLabel}>{t.profile.messengerLabel}</span>
                  <div className={styles.messengerOptions}>
                    {(['whatsapp', 'telegram'] as Messenger[]).map(m => (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.messengerBtn} ${messenger === m ? styles.active : ''}`}
                        onClick={() => { setMessenger(m); markDirty(); }}
                      >
                        {m === 'whatsapp' ? <WhatsAppIcon /> : <TelegramIcon />}
                        {m === 'whatsapp' ? t.profile.messengerWhatsapp : t.profile.messengerTelegram}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── СОЦСЕТИ ── */}
            {activeSection === 'socials' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.profile.sectionSocials}</h2>

                <button
                  type="button"
                  className={`${styles.fbBtn} ${fbLinked ? styles.fbConnected : ''}`}
                  onClick={handleLinkFacebook}
                  disabled={fbLoading || fbLinked}
                >
                  <FacebookIcon size={16} />
                  {fbLoading ? '…' : fbLinked ? t.profile.facebookConnected : t.profile.connectFacebook}
                </button>
                {fbError && <p className={styles.fieldError}>{fbError}</p>}

                <Field label={t.profile.socialLink} style={{ marginTop: 16 }}>
                  <input
                    type="url"
                    value={socialLink}
                    onChange={e => { setSocialLink(e.target.value); markDirty(); }}
                    placeholder={t.profile.socialLinkPlaceholder}
                  />
                </Field>
              </div>
            )}

            {/* ── УВЕДОМЛЕНИЯ ── */}
            {activeSection === 'notifications' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.profile.sectionNotifications}</h2>
                <Toggle
                  label={t.profile.notifyShows}
                  checked={notify}
                  onChange={v => { setNotify(v); markDirty(); }}
                />
              </div>
            )}

            {/* ── МОИ БИЛЕТЫ ── */}
            {activeSection === 'tickets' && (
              <div className={styles.section}>
                <h2 className={styles.ticketsTitle}>{t.profile.history}</h2>
                {historyLoading ? (
                  <div className={styles.skeletonList}>
                    {[1, 2].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonTicket}`} />)}
                  </div>
                ) : historyError ? (
                  <p className={styles.historyError}>{historyError}</p>
                ) : activeBookings.length === 0 && dismissingIds.size === 0 ? (
                  <p className={styles.emptyText}>{t.profile.noHistory}</p>
                ) : (
                  <div className={styles.ticketList}>
                    {/* activeBookings + bookings currently animating out (already cancelled in Firestore) */}
                    {[
                      ...activeBookings,
                      ...bookings.filter(b => dismissingIds.has(b.id) && !activeBookings.some(a => a.id === b.id)),
                    ].map(b => {
                      const isDismissing = dismissingIds.has(b.id);
                      // on_site-билет показывается сразу, даже без оплаты:
                      // деньги берут на месте, QR нужен уже при входе.
                      const isQrTicket = (
                        (b.paymentStatus === 'paid' && b.status === 'confirmed') ||
                        (b.paymentMethod === 'on_site' && b.paymentStatus === 'not_paid')
                      ) && !!b.ticketCode;
                      return (
                        <div
                          key={b.id}
                          className={isDismissing ? styles.ticketItemDismissing : undefined}
                        >
                          {isQrTicket ? (
                            <TicketCard
                              booking={b}
                              isExpanded={expandedTicketId === b.id}
                              onToggle={() => setExpandedTicketId(prev => prev === b.id ? null : b.id)}
                            />
                          ) : (
                            <BookingCard
                              booking={b}
                              t={t}
                              isDismissing={isDismissing}
                              onStartDismiss={startDismiss}
                              onCancelDismiss={cancelDismiss}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── МОИ СПЕКТАКЛИ ── */}
            {activeSection === 'shows' && (
              <div className={styles.section}>
                <h2 className={styles.ticketsTitle}>{t.profile.historyAttended}</h2>
                <VisitCounter bookings={bookings} t={t} />
                {historyLoading ? (
                  <div className={styles.skeletonList}>
                    {[1].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonTicket}`} />)}
                  </div>
                ) : attendedBookings.length === 0 ? (
                  <p className={styles.emptyText}>
                    {lang === 'FR' ? 'Aucun spectacle visité pour le moment.' : 'Вы ещё не посетили ни одного спектакля.'}
                  </p>
                ) : (
                  <div className={styles.attendedList}>
                    {groupAttendedBookings(attendedBookings).map((group, idx) => (
                      <AttendedRow
                        key={group.showId}
                        group={group}
                        stampAngle={STAMP_ANGLES[idx % STAMP_ANGLES.length]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Save button — only for form sections ── */}
          {FORM_SECTIONS.includes(activeSection) && (
            <div className={styles.saveRow}>
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={saving}
              >
                {saving ? '…' : t.profile.save}
              </button>
              {savedMsg && (
                <span className={styles.savedStatus}>
                  {lang === 'FR' ? 'Enregistré à l\'instant' : 'Сохранено только что'}
                </span>
              )}
            </div>
          )}

        </div>
      </form>
    </div>
  );
}

// ── Field ──────────────────────────────────────────────────────────────────────

function Field({
  label, error, children, style,
}: {
  label: ReactNode;
  error?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className={styles.field} style={style}>
      <label>{label}</label>
      {children}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

// ── PersonalField ──────────────────────────────────────────────────────────────

function PersonalField({
  label, providerLabel, error, children,
}: {
  label: ReactNode;
  providerLabel?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.personalFieldWrap}>
      <div className={styles.personalFieldLabel}>
        <span className={styles.personalFieldLabelText}>{label}</span>
        {providerLabel && (
          <span className={styles.providerLabel}>
            <IconLock size={10} stroke={1.5} />
            {providerLabel}
          </span>
        )}
      </div>
      {children}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <span
        className={`${styles.toggleTrack} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onChange(!checked); }}
      >
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function FacebookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

// ── Booking history sub-components ─────────────────────────────────────────────

import type { T } from '../../../i18n/translations';
import type { Show } from '../../../types';
import { SHOWS } from '../../../data/shows';
import { computedIsAttended } from '../../../services/attendanceService';
import {
  hasAvailableLoyaltyReward,
  getUserAttendedCount,
  getUsedRewardCount,
  nextRewardThreshold,
  cycleProgress,
} from '../../../services/loyaltyService';
import { cancelBookingByUser } from '../../../services/bookingService';
import { TicketCard, StampBadge } from '../TicketCard';

const SHOW_MAP = new Map<string, Show>(SHOWS.map(s => [s.id, s]));
const BONUS_EVERY = 5;

// 25-bar decorative barcode — uniform height, varying width
const BOOKING_BARCODE_WIDTHS = [2,1,3,1,1,2,1,4,1,2,1,3,1,1,2,1,3,2,1,4,1,2,1,1,3] as const;

// Month map RU→FR for stub date display
const MONTH_FR_MAP_BC: Record<string, string> = {
  'Янв': 'Jan', 'Фев': 'Fév', 'Мар': 'Mar', 'Апр': 'Avr',
  'Май': 'Mai', 'Июн': 'Juin', 'Июл': 'Juil', 'Авг': 'Août',
  'Сен': 'Sep', 'Окт': 'Oct', 'Ноя': 'Nov', 'Дек': 'Déc',
};

function parseBookingDate(showDate: string, isFR: boolean): { day: string; monthAbbrev: string } {
  const parts = showDate.trim().split(/\s+/);
  const day = parts[0] ?? '—';
  const monthRu = parts[1] ?? '';
  const monthAbbrev = isFR
    ? (MONTH_FR_MAP_BC[monthRu] ?? monthRu.toLowerCase())
    : monthRu.toLowerCase();
  return { day, monthAbbrev };
}


function VisitCounter({ bookings, t }: { bookings: Booking[]; t: T }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const attended          = getUserAttendedCount(bookings);
  const isRewardAvailable = hasAvailableLoyaltyReward(bookings);
  const usedCount         = getUsedRewardCount(bookings);
  const nextThreshold     = nextRewardThreshold(bookings);
  const filled            = cycleProgress(bookings);
  const hasEverEarned     = attended >= BONUS_EVERY;

  const visitSuffix = isFR
    ? `spectacle${attended !== 1 ? 's' : ''}`
    : (attended === 1 ? 'спектакль' : attended >= 2 && attended <= 4 ? 'спектакля' : 'спектаклей');
  const visitPrefix = isFR ? 'Vous avez assisté à' : 'Вы посетили';

  const captionText = isRewardAvailable
    ? (isFR
        ? 'Votre cadeau est prêt : −50% sur le prochain spectacle !'
        : 'Ваш подарок готов: скидка −50% на следующий спектакль!')
    : (hasEverEarned && usedCount > 0)
      ? t.profile.loyaltyUsed(nextThreshold)
      : t.profile.bonusProgress(nextThreshold - attended);

  return (
    <div className={styles.visitCounter}>
      <div className={styles.visitCounterHeader}>
        <p className={styles.visitCounterTitle}>
          {visitPrefix}{' '}
          <span className={styles.visitCounterN}>{attended}</span>
          {' '}{visitSuffix}
        </p>
        <span className={styles.visitCounterLabel}>
          {isFR ? 'Loyauté' : 'Лояльность'}
        </span>
      </div>
      <div
        className={styles.visitSeats}
        role="img"
        aria-label={isFR
          ? `Progression de fidélité : ${filled} sur ${BONUS_EVERY} visites`
          : `Прогресс лояльности: ${filled} из ${BONUS_EVERY} посещений`}
      >
        {Array.from({ length: BONUS_EVERY }, (_, i) => (
          <div
            key={i}
            className={`${styles.visitSeat} ${i < filled ? styles.visitSeatFilled : ''}`}
          />
        ))}
      </div>
      <p className={styles.visitCaption}>{captionText}</p>
    </div>
  );
}

// BookingCard — for non-QR active bookings (cancelled, pending, awaiting, etc.)
function BookingCard({ booking: b, t, isDismissing = false, onStartDismiss, onCancelDismiss }: {
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

  const isAttended     = computedIsAttended(b);
  const displayStatus: BookingStatus = isAttended ? 'attended' : b.status;

  const payStatus = b.paymentStatus ?? 'not_paid';
  const isAwaitingTransfer = payStatus === 'awaiting_transfer';
  const isExpiredTransfer  = payStatus === 'expired';
  const isCancelled        = b.status === 'cancelled';

  const canCancel = !isAttended && !isCancelled && b.status !== 'attended';

  // Only compute countdown when the booking is actively awaiting payment.
  // Stops for: cancelled status, expired paymentStatus, or during dismiss animation.
  const hoursLeft = (isAwaitingTransfer && !isCancelled && !isDismissing)
    ? hoursUntilExpiry(b)
    : null;
  const paymentRef = b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`;
  const account    = getPaymentAccount(b.paymentAccountId);

  // Stub colour — same priority as TicketCard: grey > paid(burgundy) > pending/amber
  const stubVariant: 'burgundy' | 'amber' | 'grey' =
    (b.status === 'cancelled' || payStatus === 'expired')  ? 'grey'     :
    payStatus === 'paid'                                   ? 'burgundy' :
    payStatus === 'awaiting_transfer'                      ? 'amber'    :
    (b.paymentMethod === 'on_site' && payStatus === 'not_paid') ? 'amber' :
    'burgundy';

  // Date parsing
  const { day, monthAbbrev } = parseBookingDate(b.showDate, isFR);
  const timeLabel = `${monthAbbrev} · ${b.showTime}`;

  // Ticket type label
  const ticketTypeLabel =
    b.ticketType === 'student'
      ? (isFR ? 'Étudiant' : 'Студент')
      : (isFR ? 'Standard' : 'Стандарт');

  // Contextual action text
  let actionText = '';
  let actionClass = styles.bookingActionMuted;
  if (payStatus === 'paid' && b.status === 'confirmed') {
    actionText = isFR ? 'Montrer à l\'entrée →' : 'Показать на входе →';
    actionClass = styles.bookingActionMuted;
  } else if (payStatus === 'awaiting_transfer') {
    actionText = isFR ? 'Détails du virement →' : 'Реквизиты для перевода →';
    actionClass = styles.bookingActionAmber;
  } else if (b.paymentMethod === 'on_site' && payStatus === 'not_paid' && b.status !== 'cancelled') {
    actionText = isFR ? 'Paiement sur place' : 'Оплата на месте';
    actionClass = styles.bookingActionAmber;
  }

  const REASON_OPTIONS = [
    { value: 'time',    label: t.booking.cancelReasonTime    },
    { value: 'plans',   label: t.booking.cancelReasonPlans   },
    { value: 'mistake', label: t.booking.cancelReasonMistake },
    { value: 'other',   label: t.booking.cancelReasonOther   },
  ];

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
        <div className={`${styles.bookingStub} ${stubVariant === 'amber' ? styles.bookingStubAmber : stubVariant === 'grey' ? styles.bookingStubGrey : styles.bookingStubBurgundy}`}>
          <div className={styles.bookingStubDay}>{day}</div>
          <div className={`${styles.bookingStubMonth} ${stubVariant === 'amber' ? styles.bookingStubMonthAmber : stubVariant === 'grey' ? styles.bookingStubMonthGrey : ''}`}>{timeLabel}</div>
          <div className={styles.bookingStubBarcode} aria-hidden="true">
            {BOOKING_BARCODE_WIDTHS.map((w, i) => (
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
            <span className={styles.bookingShowTitle}>{b.showTitle}</span>
            <StampBadge booking={b} isFR={isFR} />
          </div>

          {/* Row 2: composition line */}
          <p className={styles.bookingCompositionLine}>
            <span>{b.ticketsCount} × {ticketTypeLabel}</span>
            {b.totalAmount > 0 && (
              <>
                <span className={styles.bookingCompositionSep}> · </span>
                <span className={styles.bookingCompositionAmount}>{b.totalAmount} €</span>
              </>
            )}
          </p>

          {/* Row 3: code + action */}
          <div className={styles.bookingCardRow3}>
            {b.ticketCode && (
              <code className={styles.bookingCode}>{b.ticketCode}</code>
            )}
            {/* Countdown for awaiting transfers */}
            {isAwaitingTransfer && hoursLeft !== null && (
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

          {/* Notes */}
          {!isAttended && displayStatus === 'confirmed' && (
            <p className={styles.bookingNoteOk}>{t.profile.bookingNoteConfirmed}</p>
          )}
          {!isAttended && isExpiredTransfer && (
            <p className={styles.bookingNoteBad}>{t.profile.bookingNoteExpired}</p>
          )}
          {!isAttended && displayStatus === 'cancelled' && !isExpiredTransfer && (
            <p className={styles.bookingNoteBad}>{t.profile.bookingNoteCancelled}</p>
          )}
          {!isAttended && payStatus === 'paid' && displayStatus === 'pending' && (
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
                {REASON_OPTIONS.map(opt => (
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

// ── Attended shows — grouped list ──────────────────────────────────────────────

interface GroupedShow {
  showId:    string;
  show:      Show | undefined;
  showTitle: string;
  count:     number;
  lastDate:  string;
  lastTime:  string;
}

function pluralRaz(n: number): string {
  if (n >= 11 && n <= 19) return 'раз';
  const last = n % 10;
  if (last >= 2 && last <= 4) return 'раза';
  return 'раз';
}

function showInitials(title: string): string {
  const clean = title.replace(/[«»""'']/g, '').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return (title[0] ?? '?').toUpperCase();
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function groupAttendedBookings(bookings: Booking[]): GroupedShow[] {
  const map = new Map<string, {
    count: number; lastDate: string; lastTime: string; lastTs: number; showTitle: string;
  }>();
  for (const b of bookings) {
    const ts    = b.createdAt.toMillis();
    const entry = map.get(b.showId);
    if (!entry) {
      map.set(b.showId, { count: 1, lastDate: b.showDate, lastTime: b.showTime, lastTs: ts, showTitle: b.showTitle });
    } else {
      entry.count += 1;
      if (ts > entry.lastTs) {
        entry.lastDate  = b.showDate;
        entry.lastTime  = b.showTime;
        entry.lastTs    = ts;
      }
    }
  }
  return Array.from(map.entries()).map(([showId, d]) => ({
    showId,
    show:      SHOW_MAP.get(showId),
    showTitle: d.showTitle,
    count:     d.count,
    lastDate:  d.lastDate,
    lastTime:  d.lastTime,
  }));
}

const STAMP_ANGLES = [3, -4, 2, -5, 3, -3, 4, -2] as const;

function AttendedRow({ group, stampAngle }: { group: GroupedShow; stampAngle: number }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';
  const { show, showTitle, count, lastDate, lastTime } = group;
  const title = show ? (isFR && show.titleFR ? show.titleFR : show.title) : showTitle;
  const thumbBg = show?.palette ?? '#2a1f1a';
  const thumbGlyph = show?.glyph ?? showInitials(title);
  const repeatText = count > 1
    ? (isFR ? `· ${count} fois` : `· были ${count} ${pluralRaz(count)}`)
    : '';
  const stampText = isFR
    ? (count > 1 ? `VU ×${count}` : 'VU')
    : (count > 1 ? `ПОСЕЩЕНО ×${count}` : 'ПОСЕЩЕНО');

  return (
    <div className={styles.attendedRow}>
      <div className={styles.attendedThumb}>
        {show?.image ? (
          <img src={show.image} alt="" className={styles.attendedThumbImg} />
        ) : (
          <div className={styles.attendedThumbPlaceholder} style={{ background: thumbBg }}>
            <span className={styles.attendedThumbGlyph}>{thumbGlyph}</span>
          </div>
        )}
      </div>
      <div className={styles.attendedRowInfo}>
        <p className={styles.attendedRowTitle}>{title}</p>
        <p className={styles.attendedRowMeta}>
          {lastDate} · {lastTime}
          {repeatText && <span className={styles.attendedRowRepeat}> {repeatText}</span>}
        </p>
      </div>
      <div className={styles.attendedStamp} aria-hidden="true" style={{ transform: `rotate(${stampAngle}deg)` }}>
        {stampText}
      </div>
    </div>
  );
}
