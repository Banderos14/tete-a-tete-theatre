import { useState, useEffect } from 'react';
import { useLang } from '../../i18n/LangContext';
import { subscribeToAudienceCount } from '../../services/statsService';
import styles from './About.module.scss';

const IMAGES = [
  { tone: 'var(--ph-1)', cls: 'tall' },
  { tone: 'var(--ph-5)', cls: ''     },
  { tone: 'var(--ph-4)', cls: ''     },
  { tone: 'var(--ph-1)', cls: 'wide' },
] as const;

export function About() {
  const { t } = useLang();
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  useEffect(() => subscribeToAudienceCount(setAudienceCount), []);

  const [metaLine1, metaLine2] = t.about.meta.split('\n');

  const stats = t.about.stats.map((s, i) =>
    i === 2 && audienceCount !== null
      ? { ...s, num: audienceCount.toLocaleString('fr-FR') }
      : s
  );

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
            {stats.map((s, i) => (
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
              data-card={i}
              className={`${styles.img} ${img.cls === 'tall' ? styles.tall : ''} ${img.cls === 'wide' ? styles.wide : ''}`}
            >
              {i === 0 && (
                <video
                  className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }}
                  aria-hidden="true"
                >
                  <source src="/images/video/premiere.webm" type="video/webm" />
                </video>
              )}
              {i === 2 && (
                <video
                  className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }}
                  aria-hidden="true"
                >
                  <source src="/images/video/deviz.webm" type="video/webm" />
                </video>
              )}
              {i === 3 && (
                <video
                  className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }}
                  aria-hidden="true"
                  style={{ objectPosition: 'center 100%' }}
                >
                  <source src="/images/video/poklon2.webm" type="video/webm" />
                </video>
              )}
              {i === 0 && <div className={styles.videoOverlay} aria-hidden="true" />}
              <div className={styles.cardInner}>
                <div className={styles.cardFooter}>
                  <span className={styles.cardLabel}>{t.about.imageLabels[i]}</span>
                  <span className={styles.cardNumber}>0{i + 1}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
