import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../i18n/LangContext';
import { useAuth } from '../../context/AuthContext';
import { LINKS } from '../../constants/links';
import type { Lang } from '../../i18n/translations';
import styles from './Header.module.scss';

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}

type Theme = 'dark' | 'light';

interface Props {
  theme: Theme;
  lang: Lang;
  onThemeChange: (t: Theme) => void;
  onLangChange: (l: Lang) => void;
  onAuthOpen: () => void;
  onProfileOpen: () => void;
}

const LANGS: Lang[] = ['RU', 'FR'];

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

export function Header({ theme, lang, onThemeChange, onLangChange, onAuthOpen, onProfileOpen }: Props) {
  const { t } = useLang();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close menu on scroll
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => { if (window.scrollY > 60) setMenuOpen(false); };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [menuOpen]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  function handleNavClick(id: string) {
    closeMenu();
    setTimeout(() => scrollToSection(id), 80);
  }

  const navLinks = [
    { label: t.nav.afisha,     id: 'afisha' },
    { label: t.nav.repertoire, id: 'repertoire' },
    { label: t.nav.about,      id: 'about' },
    { label: t.nav.people,     id: 'people' },
  ];

  return (
    <>
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
        {/* Desktop nav left */}
        <ul className={`${styles.nav} ${styles.left}`}>
          {navLinks.map(({ label, id }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={e => { e.preventDefault(); scrollToSection(id); }}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Logo center */}
        <a
          href="#top"
          className={styles.logo}
          onClick={e => { e.preventDefault(); scrollToSection('top'); }}
        >
          <img src="https://static.tildacdn.net/tild6332-3234-4533-b063-336532366435/IMG_6877.PNG" alt="ТЕТ-А-ТЕТ" />
        </a>

        {/* Right controls */}
        <div className={`${styles.nav} ${styles.right}`}>
          {/* Lang switch — desktop only */}
          <div className={`${styles.langSwitch} ${styles.desktopOnly}`}>
            {LANGS.map(l => (
              <button
                key={l}
                className={lang === l ? styles.active : undefined}
                onClick={() => onLangChange(l)}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Theme toggle — desktop only */}
          <button
            className={styles.themeToggle}
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
          </button>

          {/* Auth — desktop */}
          {user ? (
            <button
              className={`${styles.avatarBtn} ${styles.desktopOnly}`}
              onClick={onProfileOpen}
              aria-label="Личный кабинет"
              title={user.displayName ?? user.email ?? ''}
            >
              {user.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                : <span>{getInitials(user.displayName)}</span>
              }
            </button>
          ) : (
            <button className={`${styles.signInBtn} ${styles.desktopOnly}`} onClick={onAuthOpen}>
              {t.auth.headerBtn}
            </button>
          )}

          {/* Avatar visible on mobile too (quick profile access) */}
          {user && (
            <button
              className={`${styles.avatarBtn} ${styles.mobileOnly}`}
              onClick={onProfileOpen}
              aria-label="Личный кабинет"
            >
              {user.photoURL
                ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                : <span>{getInitials(user.displayName)}</span>
              }
            </button>
          )}

          {/* Burger button */}
          <button
            className={styles.burgerBtn}
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            data-open={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <div
        className={`${styles.menuOverlay} ${menuOpen ? styles.menuOverlayOpen : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Mobile menu drawer */}
      <nav
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        aria-label="Мобильное меню"
      >
        {/* Menu header */}
        <div className={styles.menuTop}>
          <img
            src="https://static.tildacdn.net/tild6332-3234-4533-b063-336532366435/IMG_6877.PNG"
            alt="ТЕТ-А-ТЕТ"
            className={styles.menuLogo}
          />
          <button className={styles.menuClose} onClick={closeMenu} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <ul className={styles.mobileNav}>
          {navLinks.map(({ label, id }) => (
            <li key={id}>
              <button onClick={() => handleNavClick(id)}>
                {label}
              </button>
            </li>
          ))}
          <li>
            <a
              href={LINKS.instagram}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            >
              Instagram
            </a>
          </li>
        </ul>

        {/* Controls row: lang + theme */}
        <div className={styles.menuControls}>
          <div className={styles.menuLangSwitch}>
            {LANGS.map(l => (
              <button
                key={l}
                className={lang === l ? styles.active : undefined}
                onClick={() => { onLangChange(l); }}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            className={styles.menuThemeToggle}
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>Тёмная</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
                <span>Светлая</span>
              </>
            )}
          </button>
        </div>

        {/* Auth button */}
        <div className={styles.menuAuth}>
          {user ? (
            <button
              className={styles.menuAuthBtn}
              onClick={() => { closeMenu(); onProfileOpen(); }}
            >
              <span className={styles.menuAuthAvatar}>
                {user.photoURL
                  ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                  : getInitials(user.displayName)
                }
              </span>
              Личный кабинет
            </button>
          ) : (
            <button
              className={styles.menuAuthBtn}
              onClick={() => { closeMenu(); onAuthOpen(); }}
            >
              {t.auth.headerBtn}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
