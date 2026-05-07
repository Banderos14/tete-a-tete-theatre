import { useState, useEffect } from 'react';
import { useLang } from '../../i18n/LangContext';
import type { Lang } from '../../i18n/translations';
import styles from './Header.module.scss';

type Theme = 'dark' | 'light';

interface Props {
  theme: Theme;
  lang: Lang;
  onThemeChange: (t: Theme) => void;
  onLangChange: (l: Lang) => void;
}

const LANGS: Lang[] = ['RU', 'FR'];

export function Header({ theme, lang, onThemeChange, onLangChange }: Props) {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navLinks = [
    { label: t.nav.afisha,     href: '#afisha' },
    { label: t.nav.repertoire, href: '#repertoire' },
    { label: t.nav.about,      href: '#about' },
    { label: t.nav.people,     href: '#people' },
    { label: t.nav.partners,   href: '#partners' },
  ];

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <ul className={`${styles.nav} ${styles.left}`}>
        {navLinks.map(({ label, href }) => (
          <li key={href}><a href={href}>{label}</a></li>
        ))}
      </ul>

      <a href="#top" className={styles.logo}>
        <img src="https://static.tildacdn.net/tild6332-3234-4533-b063-336532366435/IMG_6877.PNG" alt="ТЕТ-А-ТЕТ" />
      </a>

      <div className={`${styles.nav} ${styles.right}`}>
        <div className={styles.langSwitch}>
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
      </div>
    </header>
  );
}
