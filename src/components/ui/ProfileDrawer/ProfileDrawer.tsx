import { useState, useEffect, useRef, useCallback, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { subscribeToUserBookings, expireOverdueBookings, hoursUntilExpiry } from '../../../services/bookingService';
import { markEligibleBookingsAsAttended } from '../../../services/attendanceService';
import { PAYMENT_CONFIG, getPaymentAccount } from '../../../config/payment';
import type { Booking, BookingStatus } from '../../../types/booking';
import type { Messenger } from '../../../context/AuthContext';
import styles from './ProfileDrawer.module.scss';

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
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [fbLoading, setFbLoading] = useState(false);
  const [fbError,   setFbError]   = useState('');

  const [bookings,       setBookings]       = useState<Booking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState<string | null>(null);

  const [activeSection,    setActiveSection]    = useState<Section>('personal');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  // Синхронизация полей формы из Firestore
  useEffect(() => {
    if (!userProfile) return;
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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Realtime-подписка на брони пользователя
  useEffect(() => {
    if (!open || !user) return;
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
  useEffect(() => { setExpandedTicketId(null); }, [activeSection]);

  useEffect(() => {
    if (submitted) setErrors(validate(displayName, birthday, phone, t.profile.required));
  }, [displayName, birthday, phone, submitted, t.profile.required]);

  const markDirty = useCallback(() => setIsDirty(true), []);

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
    setTimeout(() => setSavedMsg(false), 2500);
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
  const activeBookings   = bookings.filter(b => !computedIsAttended(b));
  const attendedBookings = bookings.filter(computedIsAttended);
  const ticketCount      = activeBookings.filter(b =>
    b.paymentStatus === 'paid' && b.status === 'confirmed' && !!b.ticketCode
  ).length;

  const navItems: { id: Section; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'personal',      label: t.profile.sectionPersonal,      icon: <PersonIcon />  },
    { id: 'contacts',      label: t.profile.sectionContacts,      icon: <PhoneIcon />   },
    { id: 'socials',       label: t.profile.sectionSocials,       icon: <LinkIcon />    },
    { id: 'notifications', label: t.profile.sectionNotifications, icon: <BellIcon />    },
    { id: 'tickets',       label: t.profile.history,              icon: <TicketIcon />, badge: ticketCount || undefined },
    { id: 'shows',         label: t.profile.historyAttended,      icon: <StarIcon />    },
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

          {/* Avatar + identity */}
          <div className={styles.sidebarTop}>
            <div className={styles.avatar}>
              {photoURL
                ? <img src={photoURL} alt={headerName} referrerPolicy="no-referrer" />
                : <span>{getInitials(headerName)}</span>
              }
            </div>
            <p className={styles.sidebarName}>{headerName || '—'}</p>
            <p className={styles.sidebarEmail}>{email}</p>
            {missingCount > 0 && (
              <div className={styles.incompleteBadge}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {t.profile.incomplete(missingCount)}
              </div>
            )}
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
                {item.icon}
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
              <LogoutIcon />
              <span className={styles.navLabel}>{t.profile.logout}</span>
            </button>
          </nav>

          {/* Sidebar footer — logout desktop */}
          <div className={styles.sidebarFooter}>
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              <LogoutIcon />
              {t.profile.logout}
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
                <h2 className={styles.sectionTitle}>{t.profile.sectionPersonal}</h2>

                <Field label={
                  <>
                    {t.profile.displayName}
                    {fbLinked && (
                      <span className={styles.fbBadgeInline}>
                        <FacebookIcon size={10} /> Facebook
                      </span>
                    )}
                  </>
                } error={errors.displayName}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => { setDisplayName(e.target.value); markDirty(); }}
                    placeholder={t.auth.nameLabel}
                    autoComplete="name"
                    className={errors.displayName ? styles.inputError : ''}
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className={styles.readonlyInput}
                  />
                </Field>

                <Field label={t.profile.birthday} error={errors.birthday}>
                  {birthdayFromFb && birthday
                    ? (
                      <div className={styles.autoFilled}>
                        <span>{birthday}</span>
                        <span className={styles.fbBadge}><FacebookIcon size={11} /> Facebook</span>
                      </div>
                    ) : (
                      <input
                        type="date"
                        value={birthday}
                        onChange={e => { setBirthday(e.target.value); markDirty(); }}
                        className={`${styles.dateInput} ${errors.birthday ? styles.inputError : ''}`}
                      />
                    )
                  }
                </Field>
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
                <h2 className={styles.sectionTitle}>{t.profile.history}</h2>
                {historyLoading ? (
                  <div className={styles.skeletonList}>
                    {[1, 2].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonTicket}`} />)}
                  </div>
                ) : historyError ? (
                  <p className={styles.historyError}>{historyError}</p>
                ) : activeBookings.length === 0 ? (
                  <p className={styles.emptyText}>{t.profile.noHistory}</p>
                ) : (
                  <div className={styles.ticketList}>
                    {activeBookings.map(b => {
                      // on_site-билет показывается сразу, даже без оплаты:
                      // деньги берут на месте, QR нужен уже при входе.
                      const isQrTicket = (
                        (b.paymentStatus === 'paid' && b.status === 'confirmed') ||
                        (b.paymentMethod === 'on_site' && b.paymentStatus === 'not_paid')
                      ) && !!b.ticketCode;
                      return isQrTicket ? (
                        <TicketCard
                          key={b.id}
                          booking={b}
                          isExpanded={expandedTicketId === b.id}
                          onToggle={() => setExpandedTicketId(prev => prev === b.id ? null : b.id)}
                        />
                      ) : (
                        <BookingCard key={b.id} booking={b} t={t} show={SHOW_MAP.get(b.showId)} />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── МОИ СПЕКТАКЛИ ── */}
            {activeSection === 'shows' && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t.profile.historyAttended}</h2>
                <VisitCounter bookings={bookings} t={t} />
                {historyLoading ? (
                  <div className={styles.skeletonList}>
                    {[1].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonTicket}`} />)}
                  </div>
                ) : attendedBookings.length === 0 && !historyLoading ? (
                  <p className={styles.emptyText}>
                    {lang === 'FR' ? 'Aucun spectacle visité pour le moment.' : 'Вы ещё не посетили ни одного спектакля.'}
                  </p>
                ) : (
                  <div className={styles.ticketList}>
                    {attendedBookings.map(b => (
                      <AttendedCard key={b.id} booking={b} show={SHOW_MAP.get(b.showId)} t={t} />
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
                className={`${styles.saveBtn} ${savedMsg ? styles.savedBtn : ''}`}
                disabled={saving}
              >
                {saving ? '…' : savedMsg ? `✓ ${t.profile.saved}` : t.profile.save}
              </button>
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

function PersonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
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
import { TicketCard } from '../TicketCard';

const SHOW_MAP = new Map<string, Show>(SHOWS.map(s => [s.id, s]));
const BONUS_EVERY = 5;

const STATUS_LABEL_KEY: Record<BookingStatus, keyof T['profile']> = {
  pending:   'statusPending',
  confirmed: 'statusConfirmed',
  cancelled: 'statusCancelled',
  attended:  'statusAttended',
};

function VisitCounter({ bookings, t }: { bookings: Booking[]; t: T }) {
  const attended         = getUserAttendedCount(bookings);
  const isRewardAvailable = hasAvailableLoyaltyReward(bookings);
  const usedCount        = getUsedRewardCount(bookings);
  const nextThreshold    = nextRewardThreshold(bookings);
  const filled           = cycleProgress(bookings);

  const hasEverEarned = attended >= BONUS_EVERY;

  return (
    <div className={styles.visitCounter}>
      <p className={styles.visitText}>{t.profile.visitCount(attended)}</p>
      {attended > 0 && (
        isRewardAvailable
          ? <p className={styles.visitBonus}>{t.profile.bonusComplete}</p>
          : hasEverEarned && usedCount > 0
            ? <p className={styles.visitProgress}>{t.profile.loyaltyUsed(nextThreshold)}</p>
            : <p className={styles.visitProgress}>{t.profile.bonusProgress(nextThreshold - attended)}</p>
      )}
      {attended > 0 && (
        <div className={styles.visitBar}>
          {Array.from({ length: BONUS_EVERY }, (_, i) => (
            <div
              key={i}
              className={`${styles.visitDot} ${i < filled ? styles.visitDotFilled : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// BookingCard — for non-QR active bookings (cancelled, pending, awaiting, etc.)
function BookingCard({ booking: b, t, show }: { booking: Booking; t: T; show?: Show }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const [cancelOpen,    setCancelOpen]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelComment, setCancelComment] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState('');

  const isAttended     = computedIsAttended(b);
  const displayStatus: BookingStatus = isAttended ? 'attended' : b.status;
  const statusKey      = STATUS_LABEL_KEY[displayStatus] as keyof typeof t.profile;
  const statusLabel    = t.profile[statusKey] as string;

  const payStatus = b.paymentStatus ?? 'not_paid';
  const isAwaitingTransfer = payStatus === 'awaiting_transfer';
  const isExpiredTransfer  = payStatus === 'expired';

  const canCancel = !isAttended && b.status !== 'cancelled' && b.status !== 'attended';

  const payMethodLabel = b.paymentMethod === 'bank_transfer'
    ? t.profile.payMethodTransfer
    : t.profile.payMethodOnSite;

  const payStatusLabel =
    payStatus === 'paid'              ? t.profile.payStatusPaid      :
    payStatus === 'awaiting_transfer' ? t.profile.payStatusAwaiting  :
    payStatus === 'expired'           ? t.profile.payStatusExpired   :
                                        t.profile.payStatusNotPaid;

  const hoursLeft  = isAwaitingTransfer ? hoursUntilExpiry(b) : null;
  const paymentRef = b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`;
  const account    = getPaymentAccount(b.paymentAccountId);

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
    try {
      await cancelBookingByUser(b.id, cancelReason, cancelComment || undefined);
      setCancelOpen(false);
    } catch {
      setCancelError(isFR ? 'Erreur lors de l\'annulation.' : 'Ошибка при отмене. Попробуйте ещё раз.');
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className={`${styles.bookingCard} ${styles[`bookingCard_${displayStatus}`] ?? ''}`}>
      <div className={styles.bookingCardRow}>
        {show && (
          <div className={styles.showGlyphBox} style={{ background: show.palette }}>
            {show.glyph}
          </div>
        )}
        <div className={styles.bookingCardContent}>
          <div className={styles.bookingCardTop}>
            <span className={styles.bookingShowTitle}>{b.showTitle}</span>
            <span className={`${styles.bookingStatus} ${styles[`bookingStatus_${displayStatus}`]}`}>
              {statusLabel}
            </span>
          </div>
          <div className={styles.bookingCardMeta}>
            <span>{b.showDate} · {b.showTime}</span>
            <span>{b.ticketsCount} {b.ticketsCount === 1 ? 'билет' : 'билета'}</span>
            {b.totalAmount > 0 && <span>{b.totalAmount}&nbsp;€</span>}
          </div>
          <div className={styles.bookingPayInfo}>
            <span className={styles.bookingPayMethod}>{payMethodLabel}</span>
            <span className={`${styles.bookingPayStatus} ${styles[`bookingPayStatus_${payStatus}`]}`}>
              {payStatusLabel}
            </span>
            {/* Countdown for awaiting transfers */}
            {isAwaitingTransfer && hoursLeft !== null && (
              <span className={hoursLeft <= 0 ? styles.countdownExpired : styles.countdownHours}>
                {hoursLeft <= 0
                  ? (isFR ? 'Expiré' : 'Истёкло')
                  : `${hoursLeft} ${isFR ? 'h' : 'ч.'}`}
              </span>
            )}
          </div>

          {b.ticketCode && (
            <div className={styles.bookingTicketCode}>
              <span>{t.profile.ticketCode}:</span>
              <code>{b.ticketCode}</code>
            </div>
          )}

          {/* Transfer details block — only for awaiting_transfer */}
          {isAwaitingTransfer && b.ticketCode && (
            <div className={styles.transferMiniBox}>
              <p className={styles.transferMiniLabel}>
                {isFR
                  ? `${account.label} · ${account.description}`
                  : `${account.label} · ${account.description}`}
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

// AttendedCard — compact card for the Shows section
function AttendedCard({ booking: b, show, t }: { booking: Booking; show?: Show; t: T }) {
  return (
    <div className={styles.attendedCard}>
      {show && (
        <div className={styles.attendedGlyph} style={{ background: show.palette }}>
          {show.glyph}
        </div>
      )}
      <div className={styles.attendedInfo}>
        <p className={styles.attendedTitle}>{b.showTitle}</p>
        <p className={styles.attendedMeta}>{b.showDate} · {b.showTime}</p>
      </div>
      <span className={styles.attendedBadge}>{t.profile.statusAttended}</span>
    </div>
  );
}
