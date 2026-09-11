// Левая колонка кабинета: бордовая карточка зрителя и навигация по разделам.

import { useLang } from '../../../i18n/LangContext';
import { getInitials } from './profileValidation';
import type { Section } from './sections';
import styles from './ProfileDrawer.module.scss';

/** Декоративный штрихкод карточки: 60 полос шириной 1–4px. */
const CARD_BARCODE_WIDTHS = [
  2,1,3,1,1,2,1,4,1,2,1,3,1,1,2,1,3,2,1,4,1,2,1,1,3,1,2,1,4,1,
  1,3,1,2,1,1,4,2,1,3,1,2,1,1,3,1,2,4,1,1,2,1,3,1,2,1,4,1,2,3,
] as const;

export interface NavItem {
  id: Section;
  label: string;
  badge?: number;
  warning?: boolean;
}

export function ProfileSidebar({
  headerName, email, photoURL, regYear, missingCount,
  navItems, activeSection, onSelectSection, onLogout,
}: {
  headerName: string;
  email: string;
  photoURL: string | null;
  regYear: number | null;
  missingCount: number;
  navItems: NavItem[];
  activeSection: Section;
  onSelectSection: (s: Section) => void;
  onLogout: () => void;
}) {
  const { t } = useLang();

  return (
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
          {CARD_BARCODE_WIDTHS.map((w, i) => (
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
            onClick={() => onSelectSection(item.id)}
          >
            <span className={styles.navLabel}>{item.label}</span>
            {item.warning && <span className={styles.navWarningDot} aria-hidden="true" />}
            {item.badge !== undefined && <span className={styles.navBadge}>{item.badge}</span>}
          </button>
        ))}

        {/* Logout — shown inside nav on mobile only */}
        <button
          type="button"
          className={`${styles.navItem} ${styles.navItemLogout}`}
          onClick={onLogout}
        >
          <span className={styles.navLabel}>{t.profile.logout}</span>
        </button>
      </nav>

      {/* Sidebar footer — logout desktop */}
      <div className={styles.sidebarFooter}>
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>
          {t.profile.logout} ↗
        </button>
      </div>
    </aside>
  );
}
