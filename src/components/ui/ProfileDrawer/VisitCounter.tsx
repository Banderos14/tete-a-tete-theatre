// Счётчик лояльности: сколько спектаклей посещено и сколько осталось до −50%.

import { useLang } from '../../../i18n/LangContext';
import type { T } from '../../../i18n/translations';
import type { Booking } from '../../../types/booking';
import {
  hasAvailableLoyaltyReward,
  getUserAttendedCount,
  getUsedRewardCount,
  nextRewardThreshold,
  cycleProgress,
} from '../../../services/loyaltyService';
import styles from './ProfileDrawer.module.scss';

/** Каждое пятое посещение даёт скидку — см. loyaltyService. */
export const BONUS_EVERY = 5;

export function VisitCounter({ bookings, t }: { bookings: Booking[]; t: T }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const attended          = getUserAttendedCount(bookings);
  const isRewardAvailable = hasAvailableLoyaltyReward(bookings);
  const usedCount         = getUsedRewardCount(bookings);
  const nextThreshold     = nextRewardThreshold(bookings);
  const filled            = cycleProgress(bookings);
  const hasEverEarned     = attended >= BONUS_EVERY;

  const visitSuffix = isFR
    ? `spectacle${attended !== 1 ? 's' : ''}`
    : (attended === 1 ? 'спектакль' : attended >= 2 && attended <= 4 ? 'спектакля' : 'спектаклей');
  const visitPrefix = isFR ? 'Vous avez assisté à' : 'Вы посетили';

  const captionText = isRewardAvailable
    ? (isFR
        ? 'Votre cadeau est prêt : −50% sur le prochain spectacle !'
        : 'Ваш подарок готов: скидка −50% на следующий спектакль!')
    : (hasEverEarned && usedCount > 0)
      ? t.profile.loyaltyUsed(nextThreshold)
      : t.profile.bonusProgress(nextThreshold - attended);

  return (
    <div className={styles.visitCounter}>
      <div className={styles.visitCounterHeader}>
        <p className={styles.visitCounterTitle}>
          {visitPrefix}{' '}
          <span className={styles.visitCounterN}>{attended}</span>
          {' '}{visitSuffix}
        </p>
        <span className={styles.visitCounterLabel}>
          {isFR ? 'Loyauté' : 'Лояльность'}
        </span>
      </div>
      <div
        className={styles.visitSeats}
        role="img"
        aria-label={isFR
          ? `Progression de fidélité : ${filled} sur ${BONUS_EVERY} visites`
          : `Прогресс лояльности: ${filled} из ${BONUS_EVERY} посещений`}
      >
        {Array.from({ length: BONUS_EVERY }, (_, i) => (
          <div
            key={i}
            className={`${styles.visitSeat} ${i < filled ? styles.visitSeatFilled : ''}`}
          />
        ))}
      </div>
      <p className={styles.visitCaption}>{captionText}</p>
    </div>
  );
}
