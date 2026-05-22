import { useEffect, useCallback } from 'react';
import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import { StageLight } from './StageLight';
import styles from './Hero.module.scss';

const RIG_POSITIONS = [13, 25, 38, 50, 62, 75, 87];

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

  useEffect(() => {
    const stage = new StageLight('stage-canvas', 'top');
    stage.start();
    return () => stage.stop();
  }, []);

  return (
    <section className={styles.hero} id="top">
      <canvas id="stage-canvas" className={styles.canvas} />

      <div className={styles.rigBar}>
        {RIG_POSITIONS.map((pct, i) => (
          <div key={i} className={styles.lamp} style={{ left: `${pct}%` }}>
            <div className={`${styles.lampDot} ${i % 2 === 0 ? styles.lampRed : styles.lampWhite}`} />
          </div>
        ))}
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
