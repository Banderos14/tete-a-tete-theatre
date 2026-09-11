// Раздел «Мои спектакли»: счётчик лояльности и список посещённых спектаклей.
// Десктопный раздел shows и мобильная вкладка favorites рисуют одно и то же —
// различается только заголовок, поэтому раздел один и принимает title.

import { useLang } from '../../../i18n/LangContext';
import type { T } from '../../../i18n/translations';
import type { Booking } from '../../../types/booking';
import { VisitCounter } from './VisitCounter';
import { groupAttendedBookings, pluralRaz, showInitials, type GroupedShow } from './attendedGrouping';
import styles from './ProfileDrawer.module.scss';

/** Углы наклона штампов: у соседних строк они разные — как у настоящих печатей. */
const STAMP_ANGLES = [3, -4, 2, -5, 3, -3, 4, -2] as const;

export function AttendedSection({ title, bookings, attendedBookings, loading, t }: {
  title: string;
  bookings: Booking[];
  attendedBookings: Booking[];
  loading: boolean;
  t: T;
}) {
  const { lang } = useLang();

  return (
    <div className={styles.section}>
      <h2 className={styles.ticketsTitle}>{title}</h2>
      <VisitCounter bookings={bookings} t={t} />
      {loading ? (
        <div className={styles.skeletonList}>
          <div className={`${styles.skeleton} ${styles.skeletonTicket}`} />
        </div>
      ) : attendedBookings.length === 0 ? (
        <p className={styles.emptyText}>
          {lang === 'FR' ? 'Aucun spectacle visité pour le moment.' : 'Вы ещё не посетили ни одного спектакля.'}
        </p>
      ) : (
        <div className={styles.attendedList}>
          {groupAttendedBookings(attendedBookings).map((group, idx) => (
            <AttendedRow
              key={group.showId}
              group={group}
              stampAngle={STAMP_ANGLES[idx % STAMP_ANGLES.length]!}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttendedRow({ group, stampAngle }: { group: GroupedShow; stampAngle: number }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';
  const { show, showTitle, count, lastDate, lastTime } = group;
  const title = show ? (isFR && show.titleFR ? show.titleFR : show.title) : showTitle;
  const thumbBg = show?.palette ?? '#2a1f1a';
  const thumbGlyph = showInitials(title);
  const repeatText = count > 1
    ? (isFR ? `· ${count} fois` : `· были ${count} ${pluralRaz(count)}`)
    : '';
  const stampWord = isFR ? 'VU' : 'ПОСЕЩЕНО';
  const stampText = count > 1 ? `${stampWord} ×${count}` : stampWord;

  return (
    <div className={styles.attendedRow}>
      <div className={styles.attendedThumb}>
        {show?.image ? (
          <img src={show.image} alt="" className={styles.attendedThumbImg} />
        ) : (
          <div className={styles.attendedThumbPlaceholder} style={{ background: thumbBg }}>
            <span className={styles.attendedThumbGlyph}>{thumbGlyph}</span>
          </div>
        )}
      </div>
      <div className={styles.attendedRowInfo}>
        <p className={styles.attendedRowTitle}>{title}</p>
        <p className={styles.attendedRowMeta}>
          {lastDate} · {lastTime}
          {repeatText && <span className={styles.attendedRowRepeat}> {repeatText}</span>}
        </p>
      </div>
      <div className={styles.attendedStamp} aria-hidden="true" style={{ transform: `rotate(${stampAngle}deg)` }}>
        {stampText}
      </div>
    </div>
  );
}
