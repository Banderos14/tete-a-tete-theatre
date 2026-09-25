// Карточка спектакля над таблицей броней: постер, название и сводка.
// Отдельный файл без сервисов Firebase — рендерится в юнит-тесте.

import { RU } from '../../i18n';
import { showGlyph, type ShowStats } from './adminStats';
import styles from './AdminPage.module.scss';

const t = RU;

export function AdminShowCard({ stats, active, onToggle }: {
  stats: ShowStats;
  active: boolean;
  onToggle: () => void;
}) {
  const { show, bookings, tickets, revenue } = stats;
  const capacity  = 'capacity' in show ? show.capacity : show.totalSeats;
  const dateLabel = 'dateLabel' in show ? show.dateLabel : `${show.day} ${show.month} ${show.year} · ${show.time}`;

  return (
    <button
      type="button"
      className={`${styles.showCard} ${active ? styles.showCardActive : ''}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      {/* Постер — тот же show.image, что у Афиши, Репертуара и модалок.
          alt пустой: название спектакля написано рядом, иначе скринридер
          прочитал бы его дважды. Инициалы — только если афиши нет вовсе. */}
      {show.image ? (
        <img
          src={show.image}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className={styles.showCardImg}
        />
      ) : (
        <span className={styles.showCardGlyph} style={{ background: show.palette }} aria-hidden="true">
          {showGlyph(show.title)}
        </span>
      )}
      <div className={styles.showCardInfo}>
        <p className={styles.showCardTitle}>{show.title}</p>
        {dateLabel && <p className={styles.showCardDate}>{dateLabel}</p>}
        {/* Места — занятые места активных броней из вместимости зала
            (семейный билет — 3 места), а не число бронирований. */}
        <p className={styles.showCardMeta}>
          {t.admin.bookingsCount(bookings)} · {tickets}&nbsp;/&nbsp;{capacity} {t.admin.seats} · {revenue}&nbsp;€ {t.admin.totalRevenue}
        </p>
      </div>
    </button>
  );
}
