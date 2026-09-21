// Подтверждение группового прохода.
//
// Одно нажатие может принять деньги и отметить несколько броней, поэтому
// действие никогда не выполняется случайным тапом: сотрудник ещё раз видит,
// сколько денег получить и сколько человек пропустить.

import { useRef } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useModalA11y } from '../../hooks/useModalA11y';
import type { CheckinGroup } from '../../services/adminBookingService';
import { plural } from './groupLabels';
import styles from './TicketCheckPage.module.scss';

export function GroupConfirmSheet({ group: g, isOpen, onConfirm, onCancel }: {
  group: CheckinGroup | null;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useScrollLock(isOpen);
  useModalA11y(isOpen, onCancel, sheetRef);
  if (!isOpen || !g) return null;

  const people   = g.remainingTickets;
  const partial  = g.attendedTickets > 0;
  const viewers  = `${people} ${plural(people, 'зритель проходит', 'зрителя проходят', 'зрителей проходят')}`;
  const sentence = g.cashDue > 0
    ? `Подтвердите, что ${g.cashDue} € получены и ${viewers} в зал.`
    : `Подтвердите, что ${viewers} в зал.`;

  return (
    <div className={styles.sheetOverlay} onClick={onCancel}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-confirm-title"
        onClick={e => e.stopPropagation()}
      >
        <p id="group-confirm-title" className={styles.sheetTitle}>Подтвердите проход</p>

        <dl className={styles.sheetRows}>
          <div className={styles.sheetRow}><dt>Зритель</dt><dd>{g.bookings[0]?.userName}</dd></div>
          <div className={styles.sheetRow}>
            <dt>Бронирований</dt>
            <dd>{g.remainingBookings}{partial ? ` из ${g.bookingsCount}` : ''}</dd>
          </div>
          <div className={styles.sheetRow}>
            <dt>Билетов</dt>
            <dd>{people}{partial ? ` из ${g.totalTickets}` : ''}</dd>
          </div>
          <div className={`${styles.sheetRow} ${g.cashDue > 0 ? styles.sheetRowCash : ''}`.trim()}>
            <dt>К оплате на месте</dt><dd>{g.cashDue} €</dd>
          </div>
          <div className={styles.sheetRow}><dt>Уже оплачено</dt><dd>{g.paidAmount} €</dd></div>
        </dl>

        <p className={styles.sheetText}>{sentence}</p>

        <div className={styles.sheetActions}>
          <button className={styles.groupActionBtn} onClick={onConfirm}>Подтвердить</button>
          <button className={styles.secondaryBtn} onClick={onCancel}>Назад</button>
        </div>
      </div>
    </div>
  );
}
