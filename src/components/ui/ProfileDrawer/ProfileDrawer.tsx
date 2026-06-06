import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { getUserBookings } from '../../../services/bookingService';
import type { Booking, BookingStatus } from '../../../types/booking';
import type { Messenger } from '../../../context/AuthContext';
import styles from './ProfileDrawer.module.scss';

// ── helpers ────────────────────────────────────────────────────────────────────

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
  const code  = (err as { code?: string })?.code ?? '';
  const isFR  = lang === 'FR';
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

// ── validation ─────────────────────────────────────────────────────────────────

interface ValidationErrors {
  displayName?: string;
  birthday?:    string;
  phone?:       string;
}

function validate(displayName: string, birthday: string, phone: string, required: string): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!displayName.trim())  errors.displayName = required;
  if (!birthday)            errors.birthday    = required;
  if (!phone.trim())        errors.phone       = required;
  return errors;
}

// ── component ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, loading, logout, saveProfile, linkFacebook } = useAuth();

  // ── form fields ──
  const [displayName, setDisplayName] = useState('');
  const [birthday,    setBirthday]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [messenger,   setMessenger]   = useState<Messenger>('whatsapp');
  const [socialLink,  setSocialLink]  = useState('');
  const [notify,      setNotify]      = useState(true);

  // ── form state ──
  const [saving,      setSaving]      = useState(false);
  const [savedMsg,    setSavedMsg]    = useState(false);
  const [errors,      setErrors]      = useState<ValidationErrors>({});
  const [submitted,   setSubmitted]   = useState(false); // track first submit attempt

  // ── unsaved guard ──
  const [isDirty,     setIsDirty]     = useState(false);
  const [warnVisible, setWarnVisible] = useState(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── facebook ──
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError,   setFbError]   = useState('');

  // ── booking history ──
  const [bookings,        setBookings]        = useState<Booking[]>([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);

  // ── sync from Firestore ──
  useEffect(() => {
    if (!userProfile) return;

    // Firestore displayName might be empty on first login — fall back to Firebase Auth
    setDisplayName(userProfile.displayName || user?.displayName || '');
    setBirthday(userProfile.birthday ?? '');
    setPhone(userProfile.phone ?? '');
    setMessenger(userProfile.phoneMessenger ?? 'whatsapp');

    // Clear malformed social link from old code (access token was saved as URL)
    const social = userProfile.socialLink ?? '';
    const isBadUrl = social.startsWith('https://facebook.com/EAA');
    setSocialLink(isBadUrl ? '' : social);
    if (isBadUrl) saveProfile({ socialLink: '' });

    setNotify(userProfile.notifications ?? true);
    setIsDirty(false);
    setErrors({});
    setSubmitted(false);
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── body scroll lock ──
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── load booking history when drawer opens ──
  useEffect(() => {
    if (!open || !user) return;
    setHistoryLoading(true);
    getUserBookings(user.uid)
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setHistoryLoading(false));
  }, [open, user]);

  // ── helpers ──
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

  // Live-validate after first submit attempt
  useEffect(() => {
    if (submitted) setErrors(validate(displayName, birthday, phone, t.profile.required));
  }, [displayName, birthday, phone, submitted, t.profile.required]);

  // ── save ──
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(displayName, birthday, phone, t.profile.required);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    await saveProfile({ displayName, birthday, phone, phoneMessenger: messenger, socialLink, notifications: notify });
    setSaving(false);
    setSavedMsg(true);
    setIsDirty(false);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  // ── Facebook link ──
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
  }, [linkFacebook, markDirty]);

  async function handleLogout() {
    onClose();
    await logout();
  }

  // ── derived ──
  const headerName    = displayName || user?.displayName || userProfile?.displayName || '';
  const email         = user?.email ?? userProfile?.email ?? '';
  const photoURL      = user?.photoURL ?? null;
  const fbLinked      = userProfile?.facebookLinked ?? false;
  const birthdayFromFb = userProfile?.birthdayFromFb ?? false;
  const missingCount  = Object.keys(validate(displayName, birthday, phone, t.profile.required)).length;

  // ── loading skeleton ──
  if (open && loading) {
    return (
      <>
        <div className={`${styles.overlay} ${styles.overlayVisible}`} onClick={tryClose} />
        <aside className={`${styles.drawer} ${styles.drawerOpen}`} aria-label="Личный кабинет">
          <div className={styles.skeletonWrap}>
            <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
            <div className={styles.skeletonLines}>
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
              <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} />
            </div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.skeletonBlock}>
              <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
              <div className={`${styles.skeleton} ${styles.skeletonField}`} />
            </div>
          ))}
        </aside>
      </>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
        onClick={tryClose}
      >
        {warnVisible && (
          <div className={styles.unsavedToast} onClick={e => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            {t.profile.unsavedWarning}
          </div>
        )}
      </div>

      {/* Drawer */}
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-label="Личный кабинет">

        {/* ── Header ── */}
        <div className={styles.drawerHeader}>
          <div className={styles.avatar}>
            {photoURL
              ? <img src={photoURL} alt={headerName} referrerPolicy="no-referrer" />
              : <span>{getInitials(headerName)}</span>
            }
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{headerName || '—'}</p>
            <p className={styles.userEmail}>{email}</p>
          </div>
          <button className={styles.closeBtn} onClick={tryClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Profile incomplete banner ── */}
        {missingCount > 0 && (
          <div className={styles.incompleteBanner}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            {t.profile.incomplete(missingCount)}
          </div>
        )}

        {/* ── Content ── */}
        <div className={styles.content}>
          <form onSubmit={handleSave} noValidate>

            {/* ── ЛИЧНЫЕ ДАННЫЕ ── */}
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{t.profile.sectionPersonal}</p>

              <Field
                label={
                  <>
                    {t.profile.displayName}
                    {fbLinked && <span className={styles.fbBadgeInline}><FacebookIcon size={10} /> Facebook</span>}
                  </>
                }
                error={errors.displayName}
              >
                <input
                  type="text"
                  value={displayName}
                  onChange={e => { setDisplayName(e.target.value); markDirty(); }}
                  placeholder={t.auth.nameLabel}
                  autoComplete="name"
                  className={errors.displayName ? styles.inputError : ''}
                />
              </Field>

              <Field label={t.profile.birthday} error={errors.birthday}>
                {birthdayFromFb && birthday
                  ? <div className={styles.autoFilled}>
                      <span>{birthday}</span>
                      <span className={styles.fbBadge}><FacebookIcon size={11} /> Facebook</span>
                    </div>
                  : <input
                      type="date"
                      value={birthday}
                      onChange={e => { setBirthday(e.target.value); markDirty(); }}
                      className={`${styles.dateInput} ${errors.birthday ? styles.inputError : ''}`}
                    />
                }
              </Field>
            </div>

            {/* ── КОНТАКТЫ ── */}
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{t.profile.sectionContacts}</p>

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

            {/* ── СОЦСЕТИ ── */}
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{t.profile.sectionSocials}</p>

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

              <Field label={t.profile.socialLink} style={{ marginTop: 14 }}>
                <input
                  type="url"
                  value={socialLink}
                  onChange={e => { setSocialLink(e.target.value); markDirty(); }}
                  placeholder={t.profile.socialLinkPlaceholder}
                />
              </Field>
            </div>

            {/* ── УВЕДОМЛЕНИЯ ── */}
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{t.profile.sectionNotifications}</p>
              <Toggle
                label={t.profile.notifyShows}
                checked={notify}
                onChange={v => { setNotify(v); markDirty(); }}
              />
            </div>

            <button
              type="submit"
              className={`${styles.saveBtn} ${savedMsg ? styles.savedBtn : ''}`}
              disabled={saving}
            >
              {saving ? '…' : savedMsg ? `✓ ${t.profile.saved}` : t.profile.save}
            </button>

          </form>

          {/* ── МОИ БИЛЕТЫ ── */}
          <div className={styles.historySection}>
            <p className={styles.sectionLabel}>{t.profile.history}</p>

            {/* Visit counter + bonus */}
            <VisitCounter bookings={bookings} t={t} />

            {historyLoading ? (
              <div className={styles.historyLoading}>
                {[1, 2].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonField}`} />)}
              </div>
            ) : bookings.length === 0 ? (
              <p className={styles.emptyText}>{t.profile.noHistory}</p>
            ) : (
              <div className={styles.bookingList}>
                {bookings.map(b => (
                  <BookingCard key={b.id} booking={b} t={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className={styles.drawerFooter}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {t.profile.logout}
          </button>
        </div>

      </aside>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({
  label, error, children, style,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
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

// ── Booking history sub-components ────────────────────────────────────────────

import type { T } from '../../../i18n/translations';

const BONUS_EVERY = 5;

const STATUS_LABEL_KEY: Record<BookingStatus, keyof T['profile']> = {
  pending:   'statusPending',
  confirmed: 'statusConfirmed',
  cancelled: 'statusCancelled',
  attended:  'statusAttended',
};

function VisitCounter({ bookings, t }: { bookings: Booking[]; t: T }) {
  const attended = bookings.filter(b => b.status === 'attended').length;
  const remaining = attended === 0 ? BONUS_EVERY : BONUS_EVERY - (attended % BONUS_EVERY);
  const isBonusReady = attended > 0 && attended % BONUS_EVERY === 0;

  return (
    <div className={styles.visitCounter}>
      <p className={styles.visitText}>{t.profile.visitCount(attended)}</p>
      {attended > 0 && (
        isBonusReady
          ? <p className={styles.visitBonus}>{t.profile.bonusComplete}</p>
          : <p className={styles.visitProgress}>{t.profile.bonusProgress(remaining)}</p>
      )}
      {attended > 0 && (
        <div className={styles.visitBar}>
          {Array.from({ length: BONUS_EVERY }, (_, i) => (
            <div
              key={i}
              className={`${styles.visitDot} ${i < (attended % BONUS_EVERY || BONUS_EVERY) ? styles.visitDotFilled : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking: b, t }: { booking: Booking; t: T }) {
  const statusKey = STATUS_LABEL_KEY[b.status] as keyof typeof t.profile;
  const statusLabel = t.profile[statusKey] as string;

  return (
    <div className={`${styles.bookingCard} ${styles[`bookingCard_${b.status}`] ?? ''}`}>
      <div className={styles.bookingCardTop}>
        <span className={styles.bookingShowTitle}>{b.showTitle}</span>
        <span className={`${styles.bookingStatus} ${styles[`bookingStatus_${b.status}`]}`}>
          {statusLabel}
        </span>
      </div>
      <div className={styles.bookingCardMeta}>
        <span>{b.showDate} · {b.showTime}</span>
        <span>{b.ticketsCount} {b.ticketsCount === 1 ? 'билет' : 'билета'}</span>
        {b.totalAmount > 0 && <span>{b.totalAmount}&nbsp;€</span>}
      </div>
      {b.ticketCode && (
        <div className={styles.bookingTicketCode}>
          <span>{t.profile.ticketCode}:</span>
          <code>{b.ticketCode}</code>
        </div>
      )}
    </div>
  );
}
