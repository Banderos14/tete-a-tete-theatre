import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Socials.module.scss';

const TILES = [
  { kind: 'feature' },
  { kind: ''        },
  { kind: ''        },
  { kind: ''        },
  { kind: ''        },
  { kind: ''        },
] as const;

interface Props {
  theme: 'dark' | 'light';
}

export function Socials({ theme }: Props) {
  const { t } = useLang();

  return (
    <section className={styles.section} id="instagram">
      <div className="section-head reveal">
        <div className="num">{t.socials.num}</div>
        <h2>{t.socials.title} <span className="it">{t.socials.titleIt}</span></h2>
        <div className="meta">@teteatete<br />NICE</div>
      </div>

      <div className={styles.grid}>
        <div className={`${styles.text} reveal`}>
          <h3>{t.socials.h3} <span className={styles.it}>{t.socials.h3It}</span> {t.socials.h3After}</h3>
          <p>{t.socials.text}</p>
          <div className={styles.socials}>
            <a className="btn btn-primary" href={LINKS.instagram} target="_blank" rel="noopener noreferrer">
              Instagram <span className="arrow">→</span>
            </a>
            <a className="btn btn-ghost" href={LINKS.threads} target="_blank" rel="noopener noreferrer">Threads</a>
            <a className="btn btn-ghost" href={LINKS.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
          </div>
        </div>

        <div className={`${styles.mosaic} reveal`} data-theme={theme}>
          {TILES.map((tile, i) => (
            <div
              key={i}
              className={`${styles.tile} ${tile.kind === 'feature' ? styles.feature : ''}`}
              data-tile={i}
            >
              {i === 0 && (
                <video
                  className={styles.videoBg}
                  src="/images/video/zakulis.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }}
                  aria-hidden="true"
                />
              )}
              {i === 0 && <div className={styles.videoOverlay} aria-hidden="true" />}
              <div className={styles.badge}>{t.socials.tileLabels[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
