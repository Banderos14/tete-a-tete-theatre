import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import styles from './ProfileDrawer.module.scss';

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

interface Props {
  open: boolean;
  onClose: () => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { t } = useLang();
  const { user, userProfile, logout, saveProfile } = useAuth();

  const [phone,       setPhone]       = useState('');
  const [socialLink,  setSocialLink]  = useState('');
  const [notify,      setNotify]      = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [savedMsg,    setSavedMsg]    = useState(false);

  useEffect(() => {
    if (userProfile) {
      setPhone(userProfile.phone ?? '');
      setSocialLink(userProfile.socialLink ?? '');
      setNotify(userProfile.notifications ?? true);
    }
  }, [userProfile]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else       document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await saveProfile({ phone, socialLink, notifications: notify });
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  async function handleLogout() {
    onClose();
    await logout();
  }

  const displayName = user?.displayName ?? userProfile?.displayName ?? '';
  const email       = user?.email ?? userProfile?.email ?? '';
  const photoURL    = user?.photoURL ?? null;

  return (
    <>
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
        onClick={onClose}
      />
      <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-label="Личный кабинет">

        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.avatar}>
            {photoURL
              ? <img src={photoURL} alt={displayName} referrerPolicy="no-referrer" />
              : <span>{getInitials(displayName)}</span>
            }
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{displayName || '—'}</p>
            <p className={styles.userEmail}>{email}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>

          {/* Profile form */}
          <form onSubmit={handleSave}>
            <p className={styles.sectionTitle}>{t.profile.title}</p>

            <div className={styles.field}>
              <label htmlFor="pd-phone">{t.profile.phone}</label>
              <input
                id="pd-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="+33 6 00 00 00 00"
                autoComplete="tel"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="pd-social">{t.profile.socialLink}</label>
              <input
                id="pd-social"
                type="url"
                value={socialLink}
                onChange={e => setSocialLink(e.target.value)}
                placeholder={t.profile.socialLinkPlaceholder}
              />
            </div>

            {/* Notifications toggle */}
            <label className={styles.toggle}>
              <span>{t.profile.notifications}</span>
              <span
                className={`${styles.toggleTrack} ${notify ? styles.toggleOn : ''}`}
                onClick={() => setNotify(v => !v)}
                role="switch"
                aria-checked={notify}
                tabIndex={0}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setNotify(v => !v); }}
              >
                <span className={styles.toggleThumb} />
              </span>
            </label>

            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? '…' : savedMsg ? `✓ ${t.profile.saved}` : t.profile.save}
            </button>
          </form>

          {/* Visit history */}
          <div className={styles.section}>
            <p className={styles.sectionTitle}>{t.profile.history}</p>
            <p className={styles.emptyText}>{t.profile.noHistory}</p>
          </div>

        </div>

        {/* Footer */}
        <div className={styles.drawerFooter}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {t.profile.logout}
          </button>
        </div>

      </aside>
    </>
  );
}
