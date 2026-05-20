import { useLang } from '../../i18n/LangContext';
import { SHOWS } from '../../data/shows';
import type { Show } from '../../types';
import styles from './AfishaSlider.module.scss';

// 4 copies: track wider than any viewport, -50% always covered by content
const COPIES = 4;
const CARDS = Array.from({ length: COPIES }, () => SHOWS).flat();

interface Props {
  onCardClick: (show: Show) => void;
}

export function AfishaSlider({ onCardClick }: Props) {
  const { t } = useLang();
  const total = SHOWS.length;

  return (
    <div
      className={`${styles.outer} reveal`}
      style={{ '--slide-count': total * (COPIES / 2) } as React.CSSProperties}
    >
      <div className={styles.track}>
        {CARDS.map((show, i) => {
          const cardIndex = (i % total) + 1;
          const month = t.months[show.month] ?? show.month;

          return (
            <div
              key={i}
              className={styles.card}
              style={{ background: show.palette }}
              onClick={() => onCardClick(show)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onCardClick(show)}
              aria-label={show.title}
            >
              {show.image && (
                <div
                  className={styles.poster}
                  style={{ backgroundImage: `url(${show.image})` }}
                />
              )}
              {!show.image && <div className={styles.glyph}>{show.glyph}</div>}
              <div className={styles.overlay} />

              <div className={styles.body}>
                <div className={styles.top}>
                  <span className={styles.counter}>
                    {String(cardIndex).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                  <span className={styles.age}>{show.age}</span>
                </div>

                <div className={styles.middle}>
                  <div className={styles.showTitle}>{show.title}</div>
                  <div className={styles.showAuthor}>{show.author}</div>
                </div>

                <div className={styles.bottom}>
                  <div className={styles.dateBlock}>
                    <span className={styles.day}>{show.day}</span>
                    <div className={styles.monthYear}>
                      <span className={styles.month}>{month}</span>
                      <span className={styles.time}>{show.time}</span>
                    </div>
                  </div>

                  <div className={styles.openHint}>
                    <span className={styles.hintText}>Подробнее</span>
                    <span className={styles.hintArrow}>→</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
