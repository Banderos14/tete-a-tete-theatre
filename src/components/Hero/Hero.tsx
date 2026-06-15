import { useCallback } from 'react';
import { IconExternalLink } from '@tabler/icons-react';
import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import { scrollToSection } from '../../utils/smoothScroll';
import styles from './Hero.module.scss';

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
              <span className={styles.accentLetter}>{t.hero.title.letter}</span>
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
            className={`btn btn-ghost ${styles.instagramBtn}`}
            href={LINKS.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={styles.instagramIcon}>
              <path d="M7.8 0h8.4C20.5 0 24 3.5 24 7.8v8.4c0 4.3-3.5 7.8-7.8 7.8H7.8C3.5 24 0 20.5 0 16.2V7.8C0 3.5 3.5 0 7.8 0Zm-.27 2.16a5.37 5.37 0 0 0-5.37 5.37v8.94a5.37 5.37 0 0 0 5.37 5.37h8.94a5.37 5.37 0 0 0 5.37-5.37V7.53a5.37 5.37 0 0 0-5.37-5.37H7.53ZM12 5.84A6.16 6.16 0 1 1 12 18.16 6.16 6.16 0 0 1 12 5.84Zm0 2.16a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6.4-2.4a1.44 1.44 0 1 1 0 2.88 1.44 1.44 0 0 1 0-2.88Z" />
            </svg>
            {t.hero.ctaInstagram}
            <IconExternalLink size={14} strokeWidth={1.5} className={styles.instagramExtIcon} aria-hidden />
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
