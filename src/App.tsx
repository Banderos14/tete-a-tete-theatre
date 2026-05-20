import { useState, useEffect, useCallback, useMemo } from 'react';
import { LangContext } from './i18n/LangContext';
import { translations } from './i18n/translations';
import type { Lang } from './i18n/translations';
import { AuthProvider } from './context/AuthContext';

import { CurtainIntro } from './components/CurtainIntro';
import { Header }       from './components/Header';
import { Hero }         from './components/Hero';
import { Marquee }      from './components/Marquee';
import { Afisha }       from './components/Afisha';
import { Socials }      from './components/Socials';
import { About }        from './components/About';
import { Repertoire }   from './components/Repertoire';
import { Team }         from './components/Team';
import { Contacts }     from './components/Contacts';
import { Footer }       from './components/Footer';
import { AuthModal }    from './components/ui/AuthModal';
import { ProfileDrawer } from './components/ui/ProfileDrawer';

type Theme = 'dark' | 'light';
type IntroState = 'closed' | 'opening' | 'done';

const INTRO_SPEED = 1.6;

export default function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [lang,  setLang] = useState<Lang>('RU');
  const [introState, setIntroState] = useState<IntroState>('closed');
  const [authOpen,    setAuthOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Apply theme attribute — цвета и шрифты управляются через variables.scss
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Curtain intro sequence
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const t1 = setTimeout(() => setIntroState('opening'), 500);
    const t2 = setTimeout(() => {
      setIntroState('done');
      document.body.style.overflow = '';
    }, 500 + INTRO_SPEED * 1000 + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Scroll reveal
  useEffect(() => {
    if (introState !== 'done') return;
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [introState]);

  const handleThemeChange = useCallback((t: Theme) => setTheme(t), []);
  const handleLangChange  = useCallback((l: Lang)  => setLang(l),  []);

  const langCtx = useMemo(
    () => ({ lang, t: translations[lang] }),
    [lang],
  );

  return (
    <AuthProvider>
      <LangContext.Provider value={langCtx}>
        <div className="grain" />
        <CurtainIntro state={introState} speed={INTRO_SPEED} />
        <Header
          theme={theme}
          lang={lang}
          onThemeChange={handleThemeChange}
          onLangChange={handleLangChange}
          onAuthOpen={() => setAuthOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
        />
        <Hero />
        <Marquee />
        <Afisha />
        <Marquee />
        <Socials />
        <About />
        <Repertoire />
        <Team />
        <Contacts />
        <Footer />

        <AuthModal    open={authOpen}    onClose={() => setAuthOpen(false)} />
        <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
      </LangContext.Provider>
    </AuthProvider>
  );
}
