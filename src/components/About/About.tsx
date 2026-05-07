import { useLang } from '../../i18n/LangContext';
import styles from './About.module.scss';

const IMAGES = [
  { tone: 'linear-gradient(135deg,#2a0e0e,#0a0405)', cls: 'tall', caption: 'Сцена · 2025', glyph: '✸' },
  { tone: 'linear-gradient(135deg,#1a141a,#08060a)', cls: '',     caption: 'Зрительный зал', glyph: '❧' },
  { tone: 'linear-gradient(135deg,#2a1a0a,#0a0605)', cls: '',     caption: 'Репетиция',      glyph: '❦' },
  { tone: 'linear-gradient(135deg,#3a1a1a,#14080a)', cls: 'wide', caption: 'Поклон труппы',  glyph: '❋' },
] as const;

export function About() {
  const { t } = useLang();
  const [metaLine1, metaLine2] = t.about.meta.split('\n');

  return (
    <section className={styles.about} id="about">
      <div className="section-head reveal">
        <div className="num">{t.about.num}</div>
        <h2>{t.about.title} <span className="it">{t.about.titleIt}</span></h2>
        <div className="meta">{metaLine1}<br />{metaLine2}</div>
      </div>

      <div className={styles.grid}>
        <div className="reveal">
          <blockquote className={styles.quote}>{t.about.quote}</blockquote>
          <div className={styles.quoteAttr}>{t.about.quoteAttr}</div>

          <div className={styles.text}>
            <p>{t.about.p1}</p>
            <p>{t.about.p2}</p>
          </div>

          <div className={styles.stats}>
            {t.about.stats.map((s, i) => (
              <div key={i} className={styles.stat}>
                <div className={styles.statNum}>
                  {s.italic ? <span className={styles.it}>{s.num}</span> : s.num}{s.suffix}
                </div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.imagery} reveal`}>
          {IMAGES.map((img, i) => (
            <div
              key={i}
              className={`${styles.img} ${img.cls === 'tall' ? styles.tall : ''} ${img.cls === 'wide' ? styles.wide : ''}`}
              style={{ background: img.tone }}
            >
              <div className={styles.imgGlyph}>{img.glyph}</div>
              <div className={styles.caption}>
                <span>{img.caption}</span>
                <span>0{i + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
