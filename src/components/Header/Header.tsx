import { useState, useEffect, useCallback } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { IconChevronRight, IconExternalLink, IconUser } from '@tabler/icons-react';
import { useLang } from '../../i18n/LangContext';
import { useAuth } from '../../context/AuthContext';
import { LINKS } from '../../constants/links';
import type { Lang } from '../../i18n/translations';
import { scrollToSection } from '../../utils/smoothScroll';
import styles from './Header.module.scss';

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
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useScrollLock(menuOpen);

  // Отслеживаем активную секцию для подсветки навигации.
  // Set: при выходе из viewport (isIntersecting=false) секция удаляется —
  // чтобы activeId не залипал на 'afisha' в мёртвых зонах.
  useEffect(() => {
    const ids = ['afisha', 'repertoire', 'about', 'people'];
    const visible = new Set<string>();

    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        // Берём самую верхнюю (по DOM) видимую секцию; '' если ни одна.
        setActiveId(ids.find(id => visible.has(id)) ?? '');
      },
      { threshold: 0.15, rootMargin: '-80px 0px -20% 0px' }
    );

    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  function handleNavClick(id: string) {
    closeMenu();
    // 100 ms lets iOS Safari release the scroll lock and restore layout before
    // the animation starts — prevents a jerk while keeping response feeling instant.
    setTimeout(() => scrollToSection(id), 100);
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
        <div className={styles.mobileSpacer} aria-hidden="true" />

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
        {/* Menu header: logo + close */}
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
        <ul className={styles.mobileNav} role="menu">
          {navLinks.map(({ label, id }) => (
            <li key={id} className={activeId === id ? styles.mobileNavItemActive : undefined}>
              <button
                onClick={() => handleNavClick(id)}
                role="menuitem"
                tabIndex={menuOpen ? 0 : -1}
              >
                <span>{label}</span>
                <IconChevronRight size={16} strokeWidth={1.5} />
              </button>
            </li>
          ))}
          <li>
            <a
              href={LINKS.instagram}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
              role="menuitem"
              tabIndex={menuOpen ? 0 : -1}
            >
              <span className={styles.mobileNavInstagram}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={styles.mobileNavInstagramIcon}>
                  <path d="M7.8 0h8.4C20.5 0 24 3.5 24 7.8v8.4c0 4.3-3.5 7.8-7.8 7.8H7.8C3.5 24 0 20.5 0 16.2V7.8C0 3.5 3.5 0 7.8 0Zm-.27 2.16a5.37 5.37 0 0 0-5.37 5.37v8.94a5.37 5.37 0 0 0 5.37 5.37h8.94a5.37 5.37 0 0 0 5.37-5.37V7.53a5.37 5.37 0 0 0-5.37-5.37H7.53ZM12 5.84A6.16 6.16 0 1 1 12 18.16 6.16 6.16 0 0 1 12 5.84Zm0 2.16a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6.4-2.4a1.44 1.44 0 1 1 0 2.88 1.44 1.44 0 0 1 0-2.88Z" />
                </svg>
                Instagram
              </span>
              <IconExternalLink size={16} strokeWidth={1.5} />
            </a>
          </li>
        </ul>

        {/* Bottom panel: lang + theme toggle | auth button */}
        <div className={styles.menuBottom}>
          {/* Row 1: lang pill + theme switch */}
          <div className={styles.menuControlsRow}>
            <div className={styles.menuLangSwitch}>
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

            <button
              className={styles.menuThemeControl}
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              <span className={styles.menuThemeLabel}>{t.nav.theme}</span>
              <span
                className={`${styles.menuThemeSwitch} ${theme === 'light' ? styles.menuThemeSwitchActive : ''}`}
                aria-hidden="true"
              >
                <span className={styles.menuThemeSwitchKnob} />
              </span>
            </button>
          </div>

          {/* Row 2: auth */}
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
                {t.nav.profileBtn}
              </button>
            ) : (
              <button
                className={styles.menuAuthBtn}
                onClick={() => { closeMenu(); onAuthOpen(); }}
              >
                <IconUser size={18} strokeWidth={1.5} />
                {t.auth.headerBtn}
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
