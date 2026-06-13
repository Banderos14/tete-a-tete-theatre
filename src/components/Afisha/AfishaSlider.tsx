import { useLang } from '../../i18n/LangContext';
import { SHOWS } from '../../data/shows';
import type { Show } from '../../types';
import styles from './AfishaSlider.module.scss';

// Warn in console if a show image URL cannot be loaded (CSS background-image gives no onError)
SHOWS.forEach(s => {
  if (!s.image) return;
  const img = new Image();
  img.onerror = () => console.warn('[show image failed]', s.id, s.image);
  img.src = s.image;
});

// 4 copies: track wider than any viewport, -50% always covered by content
const COPIES = 4;
const CARDS = Array.from({ length: COPIES }, () => SHOWS).flat();

interface Props {
  onCardClick: (show: Show) => void;
}

export function AfishaSlider({ onCardClick }: Props) {
  const { lang, t } = useLang();
  const total = SHOWS.length;

  return (
    <div
      className={`${styles.sliderWrap} reveal`}
      style={{ '--slide-count': total * (COPIES / 2) } as React.CSSProperties}
    >
      <div className={styles.outer}>
      <div className={styles.track}>
        {CARDS.map((show, i) => {
          const cardIndex = (i % total) + 1;
          const month     = t.months[show.month] ?? show.month;
          const title     = lang === 'FR' ? (show.titleFR  ?? show.title)  : show.title;
          const author    = lang === 'FR' ? (show.authorFR ?? show.author) : show.author;

          return (
            <div
              key={i}
              className={styles.card}
              style={{ background: show.palette }}
              onClick={() => onCardClick(show)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onCardClick(show)}
              aria-label={title}
            >
              {show.image && (
                <div
                  className={styles.poster}
                  style={{ backgroundImage: `url(${show.image})` }}
                />
              )}
              {/* no-image state handled by palette background */}
              <div className={styles.overlay} />

              <div className={styles.body}>
                <div className={styles.top}>
                  <span className={styles.counter}>
                    {String(cardIndex).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                  <span className={styles.age}>{show.age}</span>
                </div>

                <div className={styles.middle}>
                  <div className={styles.showTitle}>{title}</div>
                  <div className={styles.showAuthor}>{author}</div>
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
                    <span className={styles.hintText}>{t.repertoire.more}</span>
                    <span className={styles.hintArrow}>→</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
