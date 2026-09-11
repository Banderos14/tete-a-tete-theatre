import { CurtainIntro }  from './sections/CurtainIntro';
import { Header }        from './sections/Header';
import { Hero }          from './sections/Hero';
import { Marquee }       from './sections/Marquee';
import { Afisha }        from './sections/Afisha';
import { Socials }       from './sections/Socials';
import { About }         from './sections/About';
import { Repertoire }    from './sections/Repertoire';
import { Team }          from './sections/Team';
import { Contacts }      from './sections/Contacts';
import { Footer }        from './sections/Footer';
import type { Lang } from '../../i18n/translations';
import type { IntroState, Show, Theme } from '../../types';

export function HomePage({
  theme, lang, introState, introSpeed,
  onThemeChange, onLangChange,
  onAuthOpen, onProfileOpen, onBook,
}: {
  theme: Theme; lang: Lang; introState: IntroState; introSpeed: number;
  onThemeChange: (t: Theme) => void;
  onLangChange:  (l: Lang)  => void;
  onAuthOpen:    () => void;
  onProfileOpen: () => void;
  onBook:        (show: Show) => void;
}) {
  return (
    <>
      <div className="grain" />
      <CurtainIntro state={introState} speed={introSpeed} />
      <Header
        theme={theme} lang={lang}
        onThemeChange={onThemeChange}
        onLangChange={onLangChange}
        onAuthOpen={onAuthOpen}
        onProfileOpen={onProfileOpen}
      />
      {/* <main> — единственный main-лендмарк страницы: без него скринридер
          не может перейти сразу к содержимому мимо шапки и навигации. */}
      <main id="main">
        <Hero />
        <Marquee />
        <Afisha onBook={onBook} />
        <Marquee />
        <Socials theme={theme} />
        <About />
        <Repertoire onBook={onBook} />
        <Team />
        <Contacts />
      </main>
      <Footer />
    </>
  );
}
