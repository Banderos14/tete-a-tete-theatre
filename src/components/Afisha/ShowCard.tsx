import type { Show } from '../../types';
import { useLang } from '../../i18n/LangContext';
import { PosterPlaceholder } from '../ui/PosterPlaceholder';
import styles from './ShowCard.module.scss';

interface Props {
  show: Show;
  index: number;
  total: number;
}

export function ShowCard({ show, index, total }: Props) {
  const { lang, t } = useLang();
  const desc = lang === 'FR' ? show.descFR : show.desc;
  const month = t.months[show.month] ?? show.month;

  return (
    <article className={`${styles.card} reveal`} style={{ transitionDelay: `${index * 80}ms` }}>
      <div className={styles.poster}>
        <PosterPlaceholder palette={show.palette} glyph={show.glyph} title={show.title} />
        <div className={styles.ticker}>
          <span>→ {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
          <span className={styles.age}>{show.age}</span>
        </div>
        <div className={styles.price}>{show.price}</div>
      </div>

      <div className={styles.body}>
        <div className={styles.date}>
          <span className={styles.day}>{show.day}</span>
          <span className={styles.month}>{month}</span>
          <span className={styles.time}>{show.time} · {show.year}</span>
        </div>
        <div className={styles.title}>{show.title}</div>
        <div className={styles.author}>{show.author}</div>
        <p className={styles.desc}>{desc}</p>
        <div className={styles.cta}>
          <a href={show.href} target="_blank" rel="noopener noreferrer">
            {t.afisha.book} <span className="arrow">→</span>
          </a>
          <span className={styles.duration}>{show.duration}</span>
        </div>
      </div>
    </article>
  );
}
