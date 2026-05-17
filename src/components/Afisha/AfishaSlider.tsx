import { useLang } from '../../i18n/LangContext';
import { SHOWS } from '../../data/shows';
import styles from './AfishaSlider.module.scss';

// 4 копии: трек шире любого вьюпорта, -50% всегда покрыто контентом
const COPIES = 4;
const CARDS = Array.from({ length: COPIES }, () => SHOWS).flat();

export function AfishaSlider() {
  const { t } = useLang();
  const total = SHOWS.length;

  return (
    // -50% анимирует 2 набора, поэтому slide-count = total * 2 чтобы скорость осталась прежней
    <div
      className={`${styles.outer} reveal`}
      style={{ '--slide-count': total * (COPIES / 2) } as React.CSSProperties}
    >
      <div className={styles.clipper}>
      <div className={styles.track}>
        {CARDS.map((show, i) => {
          const cardIndex = (i % total) + 1;
          const month = t.months[show.month] ?? show.month;

          return (
            <div key={i} className={styles.card} style={{ background: show.palette }}>
              {/* Фото поверх градиента — если нет файла, виден градиент */}
              {show.image && (
                <div
                  className={styles.poster}
                  style={{ backgroundImage: `url(${show.image})` }}
                />
              )}
              <div className={styles.glyph}>{show.glyph}</div>
              <div className={styles.overlay} />
              <div className={styles.sideLine} />

              <div className={styles.body}>
                
                {/* Верх */}
                <div className={styles.top}>
                  <span className={styles.counter}>
                    {String(cardIndex).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                  <span className={styles.age}>{show.age}</span>
                </div>

                {/* Низ: дата + кнопка */}
                <div className={styles.bottom}>
                  <div className={styles.dateBlock}>
                    <span className={styles.day}>{show.day}</span>
                    <div className={styles.monthYear}>
                      <span className={styles.month}>{month}</span>
                      <span className={styles.time}>{show.time}</span>
                    </div>
                  </div>

                  <a
                    href={show.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.bookBtn}
                  >
                    <span className={styles.btnText}>{t.afisha.book}</span>
                    <span className={styles.btnArrow}>→</span>
                  </a>
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
