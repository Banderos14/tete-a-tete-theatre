import { REPERTOIRE } from '../../data/shows';
import { LINKS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import { PosterPlaceholder } from '../ui/PosterPlaceholder';
import styles from './Repertoire.module.scss';

export function Repertoire() {
  const { t } = useLang();

  return (
    <section className={styles.repertoire} id="repertoire">
      <div className="section-head reveal">
        <div className="num">{t.repertoire.num}</div>
        <h2>{t.repertoire.title} <span className="it">{t.repertoire.titleIt}</span></h2>
        <div className="meta">{t.repertoire.metaShows(REPERTOIRE.length)}<br />{t.repertoire.metaSeason}</div>
      </div>

      <div className={styles.grid}>
        {REPERTOIRE.map((item, i) => (
          <a
            key={i}
            className={`${styles.item} reveal`}
            href={LINKS.ticketing}
            target="_blank"
            rel="noopener noreferrer"
            style={{ transitionDelay: `${(i % 4) * 60}ms` }}
          >
            <div className={styles.poster}>
              <PosterPlaceholder palette={item.palette} glyph={item.glyph} title={item.title} kind="rep" />
            </div>
            <div className={styles.meta}>
              <span>{t.showTags[item.tag] ?? item.tag}</span>
              <span>{item.age}</span>
            </div>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.author}>{item.author}</div>
            <div className={styles.arrow}>
              {t.repertoire.more} <span className="arrow">→</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
