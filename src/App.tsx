import { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LangContext } from './i18n/LangContext';
import { translations } from './i18n/translations';
import type { Lang } from './i18n/translations';
import { AuthProvider } from './context/AuthContext';
import type { Show } from './types';

import { CurtainIntro }  from './components/CurtainIntro';
import { Header }        from './components/Header';
import { Hero }          from './components/Hero';
import { Marquee }       from './components/Marquee';
import { Afisha }        from './components/Afisha';
import { Socials }       from './components/Socials';
import { About }         from './components/About';
import { Repertoire }    from './components/Repertoire';
import { Team }          from './components/Team';
import { Contacts }      from './components/Contacts';
import { Footer }        from './components/Footer';
import { AuthModal }     from './components/ui/AuthModal';
import { ProfileDrawer } from './components/ui/ProfileDrawer';
import { BookingModal }  from './components/ui/BookingModal';
import { AdminPage }     from './pages/AdminPage';

type Theme = 'dark' | 'light';
type IntroState = 'closed' | 'opening' | 'done';

const INTRO_SPEED = 1.6;

// ── Landing page ──────────────────────────────────────────────────────────────

function LandingPage({
  theme, lang, introState,
  onThemeChange, onLangChange,
  onAuthOpen, onProfileOpen, onBook,
}: {
  theme: Theme; lang: Lang; introState: IntroState;
  onThemeChange: (t: Theme) => void;
  onLangChange:  (l: Lang)  => void;
  onAuthOpen:    () => void;
  onProfileOpen: () => void;
  onBook:        (show: Show) => void;
}) {
  return (
    <>
      <div className="grain" />
      <CurtainIntro state={introState} speed={INTRO_SPEED} />
      <Header
        theme={theme} lang={lang}
        onThemeChange={onThemeChange}
        onLangChange={onLangChange}
        onAuthOpen={onAuthOpen}
        onProfileOpen={onProfileOpen}
      />
      <Hero />
      <Marquee />
      <Afisha onBook={onBook} />
      <Marquee />
      <Socials />
      <About />
      <Repertoire onBook={onBook} />
      <Team />
      <Contacts />
      <Footer />
    </>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [theme,       setTheme]       = useState<Theme>('dark');
  const [lang,        setLang]        = useState<Lang>('RU');
  const [introState,  setIntroState]  = useState<IntroState>('closed');
  const [authOpen,    setAuthOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bookingShow, setBookingShow] = useState<Show | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const t1 = setTimeout(() => setIntroState('opening'), 500);
    const t2 = setTimeout(() => {
      setIntroState('done');
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('theatre:intro-done'));
    }, 500 + INTRO_SPEED * 1000 + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (introState !== 'done') return;
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target); // stop observing once revealed
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [introState]);

  const handleThemeChange = useCallback((t: Theme) => setTheme(t), []);
  const handleLangChange  = useCallback((l: Lang)  => setLang(l),  []);
  const handleBook        = useCallback((show: Show) => setBookingShow(show), []);

  const langCtx = useMemo(() => ({ lang, t: translations[lang] }), [lang]);

  return (
    <AuthProvider>
      <LangContext.Provider value={langCtx}>

        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                theme={theme} lang={lang} introState={introState}
                onThemeChange={handleThemeChange}
                onLangChange={handleLangChange}
                onAuthOpen={() => setAuthOpen(true)}
                onProfileOpen={() => setProfileOpen(true)}
                onBook={handleBook}
              />
            }
          />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>

        {/* Global modals — rendered outside Routes so they persist across navigation */}
        <AuthModal     open={authOpen}      onClose={() => setAuthOpen(false)} />
        <ProfileDrawer open={profileOpen}   onClose={() => setProfileOpen(false)} />
        <BookingModal  show={bookingShow}   onClose={() => setBookingShow(null)} />

      </LangContext.Provider>
    </AuthProvider>
  );
}
