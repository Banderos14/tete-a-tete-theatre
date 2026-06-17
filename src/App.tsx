import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LangContext } from './i18n/LangContext';
import { translations } from './i18n/translations';
import type { Lang } from './i18n/translations';
import { AuthProvider, useAuth } from './context/AuthContext';
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
const AdminPage       = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const TicketCheckPage = lazy(() => import('./pages/TicketCheckPage').then(m => ({ default: m.TicketCheckPage })));
const AuthModal       = lazy(() => import('./components/ui/AuthModal').then(m => ({ default: m.AuthModal })));
const ProfileDrawer   = lazy(() => import('./components/ui/ProfileDrawer').then(m => ({ default: m.ProfileDrawer })));
const BookingModal    = lazy(() => import('./components/ui/BookingModal').then(m => ({ default: m.BookingModal })));

type Theme = 'dark' | 'light';
type IntroState = 'closed' | 'opening' | 'done';

const IS_MOBILE = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
const INTRO_SPEED = IS_MOBILE ? 0 : 2.2;

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
      <Socials theme={theme} />
      <About />
      <Repertoire onBook={onBook} />
      <Team />
      <Contacts />
      <Footer />
    </>
  );
}

function UserLanguageSync({ lang }: { lang: Lang }) {
  const { user, userProfile, saveProfile } = useAuth();

  useEffect(() => {
    if (!user || !userProfile) return;
    const language = lang === 'FR' ? 'fr' : 'ru';
    if (userProfile.language === language) return;
    void saveProfile({ language });
  }, [lang, saveProfile, user, userProfile]);

  return null;
}

export default function App() {
  const [theme,       setTheme]       = useState<Theme>('dark');
  const [lang,        setLang]        = useState<Lang>(() => {
    const stored = localStorage.getItem('lang');
    return stored === 'FR' ? 'FR' : 'RU';
  });
  const [introState,  setIntroState]  = useState<IntroState>(IS_MOBILE ? 'done' : 'closed');
  const [authOpen,    setAuthOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bookingShow, setBookingShow] = useState<Show | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (IS_MOBILE) {
      window.dispatchEvent(new CustomEvent('theatre:intro-done'));
      return;
    }
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
    // Запускаем prefetch ленивых чанков в idle-окно. Suspense тоже триггерит их,
    // но явный import() начинает загрузку раньше — до первого взаимодействия пользователя.
    const schedule = (window as typeof window & { requestIdleCallback?: (fn: () => void) => void })
      .requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 400));
    schedule(() => {
      import('./components/ui/AuthModal');
      import('./components/ui/ProfileDrawer');
      import('./components/ui/BookingModal');
    });
  }, [introState]);

  useEffect(() => {
    if (introState !== 'done') return;
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target); // после появления — отписываемся
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [introState]);

  const handleThemeChange = useCallback((t: Theme) => setTheme(t), []);
  const handleLangChange  = useCallback((l: Lang)  => {
    setLang(l);
    localStorage.setItem('lang', l);
  }, []);
  const handleBook        = useCallback((show: Show) => setBookingShow(show), []);

  const langCtx = useMemo(() => ({ lang, t: translations[lang] }), [lang]);

  return (
    <AuthProvider>
      <LangContext.Provider value={langCtx}>
        <UserLanguageSync lang={lang} />

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
          <Route path="/admin" element={<Suspense fallback={null}><AdminPage /></Suspense>} />
          <Route path="/admin/checkin" element={<Suspense fallback={null}><TicketCheckPage /></Suspense>} />
        </Routes>

        {/* Глобальные модалки — ленивые, вне Routes чтобы не пересоздаваться при навигации */}
        <Suspense fallback={null}>
          <AuthModal     open={authOpen}      onClose={() => setAuthOpen(false)} />
        </Suspense>
        <Suspense fallback={null}>
          <ProfileDrawer open={profileOpen}   onClose={() => setProfileOpen(false)} />
        </Suspense>
        <Suspense fallback={null}>
          <BookingModal  show={bookingShow}   onClose={() => setBookingShow(null)} />
        </Suspense>

      </LangContext.Provider>
    </AuthProvider>
  );
}
