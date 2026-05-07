import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Hero.module.scss';

export function Hero() {
  const { t } = useLang();

  return (
    <section className={styles.hero} id="top">
      <div className={styles.spotlight} />
      <div className={styles.floor} />

      <div className={styles.content}>
        <div className={`${styles.eyebrow} eyebrow`}>
          <span className={styles.dot} />
          <span>{t.hero.eyebrow}</span>
        </div>

        <h1 className={`${styles.title} display`}>
          ТЕТ <span className={styles.it}>·</span> А <span className={styles.it}>·</span> ТЕТ
        </h1>

        <div className={styles.sub}>{t.hero.sub}</div>

        <div className={styles.meta}>
          <span>24 RUE ROSSINI</span>
          <span className={styles.sep}>·</span>
          <span>06000 NICE</span>
          <span className={styles.sep}>·</span>
          <span>{t.hero.metaYear}</span>
        </div>

        <div className={styles.ctas}>
          <a className="btn btn-primary" href={LINKS.ticketing} target="_blank" rel="noopener noreferrer">
            {t.hero.ctaAfisha} <span className="arrow">→</span>
          </a>
          <a className="btn btn-ghost" href="#repertoire">{t.hero.ctaRep}</a>
          <a className="btn btn-ghost" href={LINKS.instagram} target="_blank" rel="noopener noreferrer">
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
