import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Socials.module.scss';

const TILES = [
  { kind: 'feature', label: 'Премьера', bg: 'linear-gradient(135deg,#3a0a0e,#0a0605)', glyph: '❦' },
  { kind: '',        label: 'Закулисье', bg: 'linear-gradient(135deg,#1a1014,#08060a)', glyph: '✸' },
  { kind: '',        label: 'Репетиция', bg: 'linear-gradient(135deg,#2a1a0a,#14080a)', glyph: '❧' },
  { kind: '',        label: 'Поклон',    bg: 'linear-gradient(135deg,#1a141a,#08060a)', glyph: '✺' },
  { kind: '',        label: 'Сцена',     bg: 'linear-gradient(135deg,#2a0e14,#14060a)', glyph: '❋' },
] as const;

export function Socials() {
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

        <div className={`${styles.mosaic} reveal`}>
          {TILES.map((tile, i) => (
            <div
              key={i}
              className={`${styles.tile} ${tile.kind === 'feature' ? styles.feature : ''}`}
              style={{ background: tile.bg }}
            >
              <div className={styles.tileGlyph}>{tile.glyph}</div>
              <div className={styles.badge}>{tile.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
