// Результат скана, когда у зрителя на этот сеанс несколько активных броней.
//
// Модель броней не меняется: A, B, C остаются отдельными бронями со своими QR.
// Карточка лишь показывает их вместе, чтобы сотрудник не пропустил вторую
// бронь, которую зритель забыл показать. Все суммы и счётчики — из ответа
// сервера; здесь ничего не пересчитывается.

import { IconAlertTriangle, IconChecks, IconCircleCheck, IconLock, IconQrcode } from '@tabler/icons-react';
import type { CheckinBooking, CheckinGroup } from '../../services/adminBookingService';
import { groupActionLabel, ticketsLabel } from './groupLabels';
import styles from './TicketCheckPage.module.scss';

const PAYMENT_METHOD: Record<string, string> = {
  on_site:       'Оплата на месте',
  bank_transfer: 'Банковский перевод',
};

/** Буква брони в группе — «Бронь A», «Бронь B». */
const letterOf = (i: number) => String.fromCharCode(65 + (i % 26));

function paymentStamp(b: CheckinBooking): { text: string; tone: 'green' | 'amber' | 'red' } {
  if (b.paymentStatus === 'paid')              return { text: 'Оплачено', tone: 'green' };
  if (b.paymentStatus === 'awaiting_transfer') return { text: `Перевод не получен · ${b.totalAmount} €`, tone: 'amber' };
  if (b.paymentStatus === 'not_paid')          return { text: `Не оплачено · ${b.totalAmount} €`, tone: 'amber' };
  return { text: 'Оплата не подтверждена', tone: 'red' };
}

const STAMP_TONE = { green: styles.stampGreen, amber: styles.stampAmber, red: styles.stampRed, muted: styles.stampMuted };

function Stamp({ text, tone, tilt }: { text: string; tone: keyof typeof STAMP_TONE; tilt: 'a' | 'b' }) {
  return (
    <span className={`${styles.stamp} ${STAMP_TONE[tone]} ${tilt === 'a' ? styles.stampTiltA : styles.stampTiltB}`}>
      {text}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'cash' | 'done' }) {
  const accentClass = accent === 'cash' ? styles.groupStatCash : accent === 'done' ? styles.groupStatDone : '';
  return (
    <div className={`${styles.groupStat} ${accentClass}`.trim()}>
      <span className={styles.groupStatLabel}>{label}</span>
      <span className={styles.groupStatValue}>{value}</span>
    </div>
  );
}

function BookingCard({ b, index, scanned, blocked, onCashReceived, onMarkAttended }: {
  b: CheckinBooking;
  index: number;
  scanned: boolean;
  blocked: boolean;
  /** Действия по одной брони — только когда групповой проход заблокирован. */
  onCashReceived?: () => void;
  onMarkAttended?: () => void;
}) {
  const attended = b.status === 'attended';
  const pay = paymentStamp(b);

  return (
    <li className={`${styles.bookingCard} ${attended ? styles.bookingCardDone : ''} ${blocked ? styles.bookingCardBlocked : ''}`.trim()}>
      <div className={styles.bookingCardTop}>
        <span className={styles.bookingCardName}>Бронь {letterOf(index)}</span>
        {scanned && (
          <span className={styles.scannedChip}>
            <IconQrcode size={14} stroke={1.5} aria-hidden="true" />
            Отсканированный QR
          </span>
        )}
      </div>

      <div className={styles.bookingCardMain}>
        <div className={styles.bookingCardWhat}>
          <span className={styles.bookingCardCount}>{ticketsLabel(b.seatsCount)}</span>
          {b.ticketTypeLabel && <span className={styles.bookingCardType}>{b.ticketTypeLabel}</span>}
          <span className={styles.bookingCardMethod}>{PAYMENT_METHOD[b.paymentMethod] ?? b.paymentMethod}</span>
        </div>
        <span className={styles.bookingCardAmount}>{b.totalAmount}&nbsp;€</span>
      </div>

      <div className={styles.bookingCardStamps}>
        <Stamp text={pay.text} tone={pay.tone} tilt="a" />
        <Stamp text={attended ? 'Посещено' : 'Не посещено'} tone={attended ? 'green' : 'muted'} tilt="b" />
        <span className={`${styles.mono} ${styles.bookingCardCode}`}>{b.ticketCode}</span>
      </div>

      {blocked && (
        <p className={styles.bookingCardWarn}>
          <IconAlertTriangle size={16} stroke={1.5} aria-hidden="true" />
          Неизвестный статус оплаты — проверьте бронь в админке
        </p>
      )}

      {(onCashReceived || onMarkAttended) && (
        <div className={styles.bookingCardActions}>
          {onCashReceived && (
            <button className={styles.cashBtn} onClick={onCashReceived}>Принять {b.totalAmount} € по этой брони</button>
          )}
          {onMarkAttended && (
            <button className={styles.markBtn} onClick={onMarkAttended}>Отметить только эту бронь</button>
          )}
        </div>
      )}
    </li>
  );
}

export function GroupResultCard({ group: g, onGroupCheckIn, onCashReceived, onMarkAttended, onReset, resetLabel }: {
  group: CheckinGroup;
  onGroupCheckIn: () => void;
  onCashReceived: (b: CheckinBooking) => void;
  onMarkAttended: (b: CheckinBooking) => void;
  onReset: () => void;
  resetLabel: string;
}) {
  const first     = g.bookings[0]!;
  const allUsed   = g.remainingTickets === 0;
  const isBlocked = !allUsed && g.blockedBookingIds.length > 0;

  const variant = allUsed ? 'used' : isBlocked ? 'blocked' : 'valid';
  const cardClass   = { used: styles.cardUsed, blocked: styles.cardInvalid, valid: styles.cardValid }[variant];
  const statusClass = { used: styles.cardStatusUsed, blocked: styles.cardStatusInvalid, valid: styles.cardStatusValid }[variant];
  const statusText  = {
    used:    'Все билеты использованы',
    blocked: 'Групповой проход заблокирован',
    valid:   'Билеты действительны',
  }[variant];
  const StatusIcon = { used: IconChecks, blocked: IconLock, valid: IconCircleCheck }[variant];

  return (
    <div className={styles.cardWrap}>
      <div className={`${styles.card} ${cardClass}`}>
        <div className={styles.cardHeader}>
          <StatusIcon className={statusClass} size={28} stroke={1.5} aria-hidden="true" />
          <span className={`${styles.cardStatus} ${statusClass}`}>{statusText}</span>
        </div>

        <div className={styles.groupWho}>
          <span className={styles.groupLabel}>Зритель</span>
          <span className={styles.groupViewer}>{first.userName}</span>
          <span className={styles.groupLabel}>Спектакль</span>
          <span className={styles.groupShow}>{first.showTitle}</span>
          <span className={styles.groupShowWhen}>{first.showDate} · {first.showTime}</span>
        </div>

        <div className={styles.groupStats}>
          <Stat label="Билетов всего" value={g.totalTickets} />
          <Stat label="Бронирований" value={g.bookingsCount} />
          <Stat label="К оплате на месте" value={`${g.cashDue} €`} accent={g.cashDue > 0 ? 'cash' : undefined} />
          <Stat label="Уже оплачено" value={`${g.paidAmount} €`} />
          <Stat label="Уже прошли" value={g.attendedTickets} accent={g.attendedTickets > 0 ? 'done' : undefined} />
          <Stat label="Осталось" value={g.remainingTickets} />
        </div>

        {allUsed && (
          <p className={styles.groupNotice}>Все билеты этого зрителя уже отмечены как использованные.</p>
        )}
        {isBlocked && (
          <p className={`${styles.groupNotice} ${styles.cardValueReason}`}>
            Есть бронь с неизвестным статусом оплаты. Проведите остальные брони по одной
            или исправьте бронь в админке и отсканируйте билет снова.
          </p>
        )}
      </div>

      {!allUsed && (
        <div className={styles.actions}>
          <button
            className={styles.groupActionBtn}
            onClick={onGroupCheckIn}
            disabled={!g.canCheckIn}
          >
            {g.canCheckIn ? groupActionLabel(g) : 'Групповой проход недоступен'}
          </button>
        </div>
      )}

      <p className={styles.groupSectionLabel}>Брони зрителя на этот показ</p>
      <ul className={styles.bookingList}>
        {g.bookings.map((b, i) => {
          const blocked = g.blockedBookingIds.includes(b.bookingId);
          const pending = isBlocked && !blocked && b.status !== 'attended';
          const cashDue = b.paymentStatus === 'not_paid' || b.paymentStatus === 'awaiting_transfer';
          return (
            <BookingCard
              key={b.bookingId}
              b={b}
              index={i}
              scanned={b.bookingId === g.scannedBookingId}
              blocked={blocked}
              onCashReceived={pending && cashDue ? () => onCashReceived(b) : undefined}
              onMarkAttended={pending && b.paymentStatus === 'paid' ? () => onMarkAttended(b) : undefined}
            />
          );
        })}
      </ul>

      <div className={styles.actions}>
        <button className={styles.secondaryBtn} onClick={onReset}>{resetLabel}</button>
      </div>
    </div>
  );
}
