import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Socials.module.scss';

const TILES = [
  { kind: 'tall' },   // 0 — ЗАКУЛИСЬЕ  (col1, rows 1-2)
  { kind: ''     },   // 1 — СЦЕНА      (col2, row1)
  { kind: ''     },   // 2 — ТЕХН.ЧАСТЬ (col3, row1)
  { kind: ''     },   // 3 — МАШКА      (col2, row2)
  { kind: 'tall' },   // 4 — РЕПЕТИЦИЯ  (col3, rows 2-3)
  { kind: 'wide' },   // 5 — ПОКЛОН     (col1+2, row3)
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
              className={`${styles.tile} ${tile.kind === 'tall' ? styles.tall : ''} ${tile.kind === 'wide' ? styles.wide : ''}`}
              data-tile={i}
            >
              {i === 0 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/zakulis.webm" type="video/webm" />
                </video>
              )}
              {i === 1 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/mashka.webm" type="video/webm" />
                </video>
              )}
              {i === 2 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/techPart.webm" type="video/webm" />
                </video>
              )}
              {i === 3 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/newYear.webm" type="video/webm" />
                </video>
              )}
              {i === 4 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/ludaCouch.webm" type="video/webm" />
                </video>
              )}
              {i === 5 && (
                <video className={styles.videoBg} autoPlay muted loop playsInline preload="none"
                  onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} aria-hidden="true">
                  <source src="/images/video/mladshie.webm" type="video/webm" />
                </video>
              )}
              <div className={styles.videoOverlay} aria-hidden="true" />
              <div className={styles.badge}>{t.socials.tileLabels[i]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
