// Лояльность в кабинете: «Посетите 5 спектаклей — 6-й билет со скидкой 50%».
//
// Прогресс вычисляется из реальных броней (shared/domain/loyalty.ts): засчитан
// только реальный проход, один спектакль — одно посещение. Цену со скидкой
// считает сервер при бронировании; здесь — только понятное объяснение.

import type { T } from '../../../i18n/translations';
import type { Booking } from '../../../types/booking';
import { loyaltySummary, LOYALTY_VISITS_PER_REWARD } from '../../../services/loyaltyService';
import styles from './ProfileDrawer.module.scss';

export function VisitCounter({ bookings, t }: { bookings: Booking[]; t: T }) {
  const { progress, remaining, available } = loyaltySummary(bookings);

  return (
    <div className={styles.visitCounter}>
      <div className={styles.visitCounterHeader}>
        <p className={styles.visitCounterTitle}>
          {available
            ? t.profile.loyaltyAvailable
            : <><span className={styles.visitCounterN}>{t.profile.loyaltyOf(progress, LOYALTY_VISITS_PER_REWARD)}</span></>}
        </p>
        <span className={styles.visitCounterLabel}>{t.profile.loyaltyTitle}</span>
      </div>
      <div
        className={styles.visitSeats}
        role="img"
        aria-label={`${t.profile.loyaltyTitle}: ${t.profile.loyaltyOf(progress, LOYALTY_VISITS_PER_REWARD)}`}
      >
        {Array.from({ length: LOYALTY_VISITS_PER_REWARD }, (_, i) => (
          <div
            key={i}
            className={`${styles.visitSeat} ${i < progress ? styles.visitSeatFilled : ''}`}
          />
        ))}
      </div>
      <p className={styles.visitCaption}>{t.profile.loyaltyRule}</p>
      <p className={styles.visitCaption}>
        {available ? t.profile.bonusComplete : t.profile.bonusProgress(remaining)}
      </p>
    </div>
  );
}
