// Пояснение для зрителя: театр временно продаёт билеты не на все спектакли.
// Показывается только в ограниченном режиме продаж (shared/catalog/salesMode.ts);
// в обычном режиме компонент ничего не рендерит.

import { IconInfoCircle } from '@tabler/icons-react';
import { useLang } from '../../../i18n/LangContext';
import { isLimitedSalesMode } from '../../../../shared/catalog/salesMode';
import styles from './SalesModeNotice.module.scss';

export function SalesModeNotice({ className = '' }: { className?: string }) {
  const { t } = useLang();
  if (!isLimitedSalesMode()) return null;

  return (
    <div className={`${styles.notice} ${className}`.trim()} role="note">
      <IconInfoCircle className={styles.icon} size={18} stroke={1.5} aria-hidden="true" />
      <p className={styles.text}>
        <span className={styles.title}>{t.sales.noticeTitle}</span>{' '}
        {t.sales.noticeText}
      </p>
    </div>
  );
}
