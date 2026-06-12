import { useCallback } from 'react';
import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Hero.module.scss';

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}

export function Hero() {
  const { t } = useLang();

  const handleAfisha = useCallback(() => scrollToSection('afisha'), []);
  const handleRep    = useCallback(() => scrollToSection('repertoire'), []);

  return (
    <section className={styles.hero} id="top">
      <div className={styles.stageLights} aria-hidden="true">
        {/* Centre */}
        <div className={`${styles.beam} ${styles.beamCW}`} />
        <div className={`${styles.beam} ${styles.beamCN1}`} />
        <div className={`${styles.beam} ${styles.beamCN2}`} />
        {/* Left */}
        <div className={`${styles.beam} ${styles.beamL2}`} />
        <div className={`${styles.beam} ${styles.beamL3}`} />
        {/* Right */}
        <div className={`${styles.beam} ${styles.beamR2}`} />
        <div className={`${styles.beam} ${styles.beamR3}`} />
        {/* Red */}
        <div className={`${styles.beam} ${styles.beamRedL1}`} />
        <div className={`${styles.beam} ${styles.beamRedL2}`} />
        <div className={`${styles.beam} ${styles.beamRedR1}`} />
        <div className={`${styles.beam} ${styles.beamRedR2}`} />
        <div className={styles.haze} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.floor} />

      <div className={styles.content}>
        <div className={`${styles.eyebrow} eyebrow`}>
          <span className={styles.dot} />
          <span>{t.hero.eyebrow}</span>
        </div>

        <div className={styles.headline}>
          <h1 className={`${styles.title} display`}>
            <span className={styles.titleBefore}>{t.hero.title.before}</span>
            <span className={styles.accentGroup}>
              {/* <span className={styles.accentDot} /> */}
              <span className={styles.accentLetter}>{t.hero.title.letter}</span>
              {/* <span className={styles.accentDot} /> */}
            </span>
            <span className={styles.titleAfter}>{t.hero.title.after}</span>
          </h1>

          <div className={styles.sub}>
            <span className={styles.subAccent}>{t.hero.sub.accent}</span>
            <span>{t.hero.sub.rest}</span>
          </div>
        </div>

        <div className={styles.meta}>
          <span>24 RUE ROSSINI</span>
          <span className={styles.sep}>·</span>
          <span>06000 NICE</span>
          <span className={styles.sep}>·</span>
          <span>{t.hero.metaYear}</span>
        </div>

        <div className={styles.ctas}>
          <button className="btn btn-primary" onClick={handleAfisha}>
            {t.hero.ctaAfisha} <span className="arrow">→</span>
          </button>
          <button className="btn btn-ghost" onClick={handleRep}>
            {t.hero.ctaRep}
          </button>
          <a
            className="btn btn-ghost"
            href={LINKS.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.hero.ctaInstagram}
          </a>
        </div>
      </div>

      <div className={styles.scroll}>
        <span>{t.hero.scroll}</span>
        <div className={styles.scrollLine} />
      </div>
    </section>
  );
}
