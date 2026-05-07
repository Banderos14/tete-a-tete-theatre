import { SHOWS } from '../../data/shows';
import { useLang } from '../../i18n/LangContext';
import { ShowCard } from './ShowCard';
import styles from './Afisha.module.scss';

export function Afisha() {
  const { t } = useLang();
  const [metaLine1, metaLine2] = t.afisha.meta.split('\n');

  return (
    <section className={styles.afisha} id="afisha">
      <div className="section-head reveal">
        <div className="num">{t.afisha.num}</div>
        <h2>{t.afisha.title} <span className="it">{t.afisha.titleIt}</span></h2>
        <div className="meta">{metaLine1}<br />{metaLine2}</div>
      </div>
      <div className={styles.grid}>
        {SHOWS.map((show, i) => (
          <ShowCard key={show.id} show={show} index={i} total={SHOWS.length} />
        ))}
      </div>
    </section>
  );
}
