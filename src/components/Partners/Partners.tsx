import { PARTNERS } from '../../data/partners';
import { useLang } from '../../i18n/LangContext';
import styles from './Partners.module.scss';

export function Partners() {
  const { t } = useLang();

  return (
    <section className={styles.partners} id="partners">
      <div className="section-head reveal">
        <div className="num">{t.partners.num}</div>
        <h2>{t.partners.title} <span className="it">{t.partners.titleIt}</span></h2>
        <div className="meta">{t.partners.metaLine1}<br />{t.partners.metaLine2}</div>
      </div>

      <div className={styles.grid}>
        {PARTNERS.map((p, i) => (
          p.url ? (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className={styles.partner}>
              {p.name}
            </a>
          ) : (
            <div key={i} className={styles.partner}>{p.name}</div>
          )
        ))}
      </div>
    </section>
  );
}
