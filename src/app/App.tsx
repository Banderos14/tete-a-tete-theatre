import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LangContext } from '../i18n/LangContext';
import { translations } from '../i18n/translations';
import type { Lang } from '../i18n/translations';
import { AuthProvider } from '../context/AuthContext';
import type { IntroState, Show, Theme } from '../types';
// Тип берётся из модуля разделов, а НЕ из barrel'а ProfileDrawer: barrel
// реэкспортирует сам компонент и втянул бы Firebase в синхронный чанк
// лендинга (см. tests/unit/importGraph.test.ts).
import type { Section } from '../components/ui/ProfileDrawer/sections';
import { ErrorBoundary, RouteErrorScreen } from '../components/ui/ErrorBoundary';
import { CookieConsent } from '../components/ui/CookieConsent';
import { UserLanguageSync } from './UserLanguageSync';
import { AccountDeepLink } from './AccountDeepLink';
import { IS_MOBILE, INTRO_SPEED } from './intro';

import { HomePage } from '../pages/HomePage';
const AdminPage       = lazy(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const TicketCheckPage = lazy(() => import('../pages/TicketCheckPage').then(m => ({ default: m.TicketCheckPage })));
const NotFoundPage    = lazy(() => import('../pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
// Публичный билет из письма — открывается без входа (см. TicketPage).
const TicketPage      = lazy(() => import('../pages/TicketPage').then(m => ({ default: m.TicketPage })));
const AuthModal       = lazy(() => import('../components/ui/AuthModal').then(m => ({ default: m.AuthModal })));
const ProfileDrawer   = lazy(() => import('../components/ui/ProfileDrawer').then(m => ({ default: m.ProfileDrawer })));
const BookingModal    = lazy(() => import('../components/ui/BookingModal').then(m => ({ default: m.BookingModal })));

export default function App() {
  const [theme,       setTheme]       = useState<Theme>(() => {
    // Тема не сохранялась вовсе: светлая сбрасывалась на тёмную при каждой перезагрузке.
    try {
      return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [lang,        setLang]        = useState<Lang>(() => {
    try {
      return localStorage.getItem('lang') === 'FR' ? 'FR' : 'RU';
    } catch {
      return 'RU';
    }
  });
  const [introState,  setIntroState]  = useState<IntroState>(IS_MOBILE ? 'done' : 'closed');
  const [authOpen,    setAuthOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Раздел, на котором открывается кабинет. Нужен ссылке «Мои билеты» из письма
  // и кнопке на экране успешного бронирования.
  const [profileSection, setProfileSection] = useState<Section>('personal');
  const [bookingShow, setBookingShow] = useState<Show | null>(null);
  // Модалки монтируются только после первого открытия: до этого их чанки
  // (а вместе с ними и Firebase SDK) не нужны для показа лендинга. Флаг «липкий»,
  // чтобы не ломать анимацию закрытия — она играет на уже смонтированном узле.
  const [modalsMounted, setModalsMounted] = useState(false);
  // Производный стейт по время рендера — тот же паттерн, что в ShowModal.
  if (!modalsMounted && (authOpen || profileOpen || bookingShow !== null)) setModalsMounted(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // lang на <html> обязателен: от него зависит и озвучка скринридером, и выбор
  // display-шрифта (Bad Russian не умеет во французские акценты — см. variables.scss).
  useEffect(() => {
    document.documentElement.setAttribute('lang', lang === 'FR' ? 'fr' : 'ru');
  }, [lang]);

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
      // Промахи прогрева не должны становиться unhandled rejection: чанк всё равно
      // будет запрошен повторно при реальном открытии модалки.
      void import('../components/ui/AuthModal').catch(() => {});
      void import('../components/ui/ProfileDrawer').catch(() => {});
      void import('../components/ui/BookingModal').catch(() => {});
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

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t);
    try { localStorage.setItem('theme', t); } catch { /* приватный режим — не критично */ }
  }, []);
  const handleLangChange  = useCallback((l: Lang)  => {
    setLang(l);
    try { localStorage.setItem('lang', l); } catch { /* приватный режим — не критично */ }
  }, []);
  const handleBook        = useCallback((show: Show) => setBookingShow(show), []);

  const openProfileAt = useCallback((section: Section) => {
    setProfileSection(section);
    setProfileOpen(true);
  }, []);
  const openMyTickets = useCallback(() => openProfileAt('tickets'), [openProfileAt]);
  const requireAuth   = useCallback(() => setAuthOpen(true), []);

  const langCtx = useMemo(() => ({ lang, t: translations[lang] }), [lang]);

  return (
    <AuthProvider>
      <LangContext.Provider value={langCtx}>
        <UserLanguageSync lang={lang} onLangFromProfile={handleLangChange} />
        <AccountDeepLink onOpenTickets={openMyTickets} onRequireAuth={requireAuth} />

        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                theme={theme} lang={lang} introState={introState} introSpeed={INTRO_SPEED}
                onThemeChange={handleThemeChange}
                onLangChange={handleLangChange}
                onAuthOpen={() => setAuthOpen(true)}
                onProfileOpen={() => openProfileAt('personal')}
                onBook={handleBook}
              />
            }
          />
          <Route path="/admin" element={
            <ErrorBoundary label="AdminPage" fallback={<RouteErrorScreen />}>
              <Suspense fallback={null}><AdminPage /></Suspense>
            </ErrorBoundary>
          } />
          <Route path="/admin/checkin" element={
            <ErrorBoundary label="TicketCheckPage" fallback={<RouteErrorScreen />}>
              <Suspense fallback={null}><TicketCheckPage /></Suspense>
            </ErrorBoundary>
          } />
          <Route path="/ticket" element={
            <ErrorBoundary label="TicketPage" fallback={<RouteErrorScreen />}>
              <Suspense fallback={null}><TicketPage /></Suspense>
            </ErrorBoundary>
          } />
          {/* Неизвестный адрес: человеческая страница вместо белого экрана. */}
          <Route path="*" element={
            <ErrorBoundary label="NotFoundPage" fallback={<RouteErrorScreen />}>
              <Suspense fallback={null}><NotFoundPage /></Suspense>
            </ErrorBoundary>
          } />
        </Routes>

        {/* Глобальные модалки — ленивые, вне Routes чтобы не пересоздаваться при навигации.
            Каждая под своей границей ошибок: сбой загрузки чанка модалки не должен
            уносить весь лендинг. */}
        {modalsMounted && (
          <>
            <ErrorBoundary label="AuthModal">
              <Suspense fallback={null}>
                <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary label="ProfileDrawer">
              <Suspense fallback={null}>
                <ProfileDrawer
                  open={profileOpen}
                  initialSection={profileSection}
                  onClose={() => setProfileOpen(false)}
                />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary label="BookingModal">
              <Suspense fallback={null}>
                <BookingModal
                  show={bookingShow}
                  onClose={() => setBookingShow(null)}
                  onOpenTickets={() => { setBookingShow(null); openMyTickets(); }}
                />
              </Suspense>
            </ErrorBoundary>
          </>
        )}

        {/* Баннер согласия: GA4 не стартует, пока выбор не сделан. */}
        <CookieConsent />

      </LangContext.Provider>
    </AuthProvider>
  );
}
