// Мобильная шапка кабинета (карточка зрителя + прогресс лояльности) и нижняя
// панель вкладок. На десктопе скрыты стилями — их роль там играет сайдбар.

import { IconUser, IconTicket, IconMasksTheater, IconSettings } from '@tabler/icons-react';
import { useLang } from '../../../i18n/LangContext';
import type { Booking } from '../../../types/booking';
import { loyaltySummary, LOYALTY_VISITS_PER_REWARD as BONUS_EVERY } from '../../../services/loyaltyService';
import { getInitials } from './profileValidation';
import type { MobileTab } from './sections';
import styles from './ProfileDrawer.module.scss';

export function ProfileMobileHeader({ headerName, email, photoURL, bookings }: {
  headerName: string;
  email: string;
  photoURL: string | null;
  bookings: Booking[];
}) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const loyalty       = loyaltySummary(bookings);
  const attended      = loyalty.visits;
  const filled        = loyalty.progress;
  const isRewardAvail = loyalty.available;
  const remaining     = loyalty.remaining;

  return (
    <div className={styles.mobileHeader}>
      <div className={styles.mobileHeaderTop}>
        <div className={styles.mobileIdentity}>
          <div className={styles.mobileAvatar}>
            {photoURL
              ? <img src={photoURL} alt={headerName} referrerPolicy="no-referrer" />
              : <span>{getInitials(headerName)}</span>
            }
          </div>
          <div className={styles.mobileIdentityText}>
            <p className={styles.mobileName}>{headerName || '—'}</p>
            <p className={styles.mobileEmail}>{email}</p>
          </div>
        </div>
      </div>
      <div className={styles.mobileLoyaltyGrid}>
        <div className={styles.mobileLoyaltyCard}>
          <span className={styles.mobileLoyaltyCount}>{attended}</span>
          <span className={styles.mobileLoyaltyLabel}>
            {isFR ? 'spectacles' : 'посещений'}
          </span>
        </div>
        <div className={styles.mobileLoyaltyCard}>
          <span className={styles.mobileLoyaltyCaption}>
            {isFR ? 'avant −50%' : 'до скидки 50%'}
          </span>
          <div
            className={styles.mobileLoyaltySegments}
            role="img"
            aria-label={isFR
              ? `Fidélité : ${filled} sur ${BONUS_EVERY}`
              : `Лояльность: ${filled} из ${BONUS_EVERY}`}
          >
            {Array.from({ length: BONUS_EVERY }, (_, i) => (
              <div
                key={i}
                className={`${styles.mobileLoyaltySegment} ${i < filled ? styles.mobileLoyaltySegmentFilled : ''}`}
              />
            ))}
          </div>
          <span className={`${styles.mobileLoyaltyRemaining} ${isRewardAvail ? styles.mobileLoyaltyRewardActive : ''}`}>
            {isRewardAvail
              ? (isFR ? 'Remise −50 % disponible' : 'Скидка 50% доступна')
              : (isFR
                  ? `${filled} sur ${BONUS_EVERY} · encore ${remaining}`
                  : `${filled} из ${BONUS_EVERY} · осталось ${remaining}`)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProfileMobileTabBar({ activeTab, onSelect, hasProfileWarning }: {
  activeTab: MobileTab;
  onSelect: (tab: MobileTab) => void;
  hasProfileWarning: boolean;
}) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',   label: isFR ? 'Profil'     : 'Профиль',   icon: <IconUser size={20} stroke={1.5} /> },
    { id: 'tickets',   label: isFR ? 'Billets'    : 'Билеты',    icon: <IconTicket size={20} stroke={1.5} /> },
    { id: 'favorites', label: isFR ? 'Spectacles' : 'Спектакли', icon: <IconMasksTheater size={20} stroke={1.5} /> },
    { id: 'settings',  label: isFR ? 'Réglages'   : 'Настройки', icon: <IconSettings size={20} stroke={1.5} /> },
  ];

  return (
    <nav className={styles.mobileTabBar} aria-label={isFR ? 'Navigation' : 'Навигация'}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.mobileTab} ${activeTab === tab.id ? styles.mobileTabActive : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.id === 'profile' ? (
            <span className={styles.mobileTabIconWrap}>
              {tab.icon}
              {hasProfileWarning && <span className={styles.mobileTabWarningDot} aria-hidden="true" />}
            </span>
          ) : tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
