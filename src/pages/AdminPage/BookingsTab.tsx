// Вкладка «Брони»: сводка по кассе, карточки спектаклей-фильтров и таблица.

import { RU } from '../../i18n';
import { hoursUntilExpiry } from '../../services/bookingService';
import { getPaymentAccount, PAYMENT_CONFIG } from '../../config/payment';
import { SHOWS } from '../../data/shows';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import { formatTimestamp, PAY_STATUS_LABELS } from './adminFormatting';
import type { ConfirmAction, FilterShowId, FilterStatus } from './adminTypes';
import styles from './AdminPage.module.scss';

const PAY_STATUS_STYLE: Record<PaymentStatus, string> = {
  not_paid:          styles.payNotPaid,
  awaiting_transfer: styles.payAwaiting,
  paid:              styles.payPaid,
  expired:           styles.payExpired,
};

const t = RU;

const BOOKING_STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all',       label: 'Все' },
  { value: 'pending',   label: t.admin.statusPending },
  { value: 'confirmed', label: t.admin.statusConfirmed },
  { value: 'attended',  label: t.admin.statusAttended },
  { value: 'cancelled', label: t.admin.statusCancelled },
];

/** Инициалы спектакля для карточки без афиши. */
function showGlyph(title: string): string {
  return title.replace(/[«»]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function BookingsTab({
  bookings, fetching, updatingId,
  filterShow, onFilterShow, filterStatus, onFilterStatus,
  onConfirmAction,
}: {
  bookings: Booking[];
  fetching: boolean;
  updatingId: string | null;
  filterShow: FilterShowId;
  onFilterShow: (v: FilterShowId | ((prev: FilterShowId) => FilterShowId)) => void;
  filterStatus: FilterStatus;
  onFilterStatus: (v: FilterStatus) => void;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  const filtered = bookings
    .filter(b => filterShow  === 'all' || b.showId === filterShow)
    .filter(b => filterStatus === 'all' || b.status === filterStatus);

  const statsByShow = SHOWS.map(show => {
    const sb = bookings.filter(b => b.showId === show.id);
    return {
      show,
      count:   sb.length,
      tickets: sb.reduce((s, b) => s + b.ticketsCount, 0),
      revenue: sb.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + (b.totalAmount ?? 0), 0),
    };
  });

  const totalBookings = bookings.length;
  const totalTickets  = bookings.reduce((s, b) => s + b.ticketsCount, 0);
  const totalRevenue  = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + (b.totalAmount ?? 0), 0);

  return (
    <>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{totalBookings}</span>
          <span className={styles.summaryLabel}>{t.admin.bookings}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{totalTickets}</span>
          <span className={styles.summaryLabel}>{t.admin.totalTickets}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{totalRevenue}&nbsp;€</span>
          <span className={styles.summaryLabel}>{t.admin.totalRevenue}</span>
        </div>
      </div>

      <div className={styles.showStats}>
        {statsByShow.map(({ show, count, tickets, revenue }) => (
          <button
            key={show.id}
            className={`${styles.showCard} ${filterShow === show.id ? styles.showCardActive : ''}`}
            onClick={() => onFilterShow(prev => prev === show.id ? 'all' : show.id)}
          >
            {show.image ? (
              <img src={show.image} alt={show.title} className={styles.showCardImg} />
            ) : (
              <span className={styles.showCardGlyph} style={{ background: show.palette }}>
                {showGlyph(show.title)}
              </span>
            )}
            <div className={styles.showCardInfo}>
              <p className={styles.showCardTitle}>{show.title}</p>
              <p className={styles.showCardMeta}>
                {count} {t.admin.bookings} · {tickets} {t.admin.totalTickets} · {revenue}&nbsp;€ {t.admin.totalRevenue}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className={styles.filtersRow}>
        <div className={styles.filterGroup}>
          {filterShow !== 'all' && (
            <>
              <span className={styles.filterLabel}>
                {SHOWS.find(s => s.id === filterShow)?.title ?? filterShow}
              </span>
              <button className={styles.clearFilter} onClick={() => onFilterShow('all')}>×</button>
            </>
          )}
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t.admin.filterByStatus}</span>
          {BOOKING_STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`${styles.statusFilterBtn} ${filterStatus === opt.value ? styles.statusFilterActive : ''}`}
              onClick={() => onFilterStatus(opt.value)}
            >{opt.label}</button>
          ))}
        </div>
      </div>

      {fetching ? (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>{t.admin.noBookings}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.admin.name}</th>
                <th>{t.admin.email}</th>
                <th>{t.admin.tickets}</th>
                <th>{t.admin.amount}</th>
                <th>{t.admin.payment}</th>
                <th>{t.admin.paymentStatus}</th>
                <th>Код брони</th>
                <th>{t.admin.date}</th>
                <th>{t.admin.status}</th>
                <th>{t.admin.comment}</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  isBusy={updatingId === b.id}
                  onConfirmAction={onConfirmAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BookingRow({ booking: b, isBusy, onConfirmAction }: {
  booking: Booking;
  isBusy: boolean;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  const payStatus: PaymentStatus = b.paymentStatus ?? 'not_paid';
  const bStatus: BookingStatus   = b.status ?? 'pending';
  const account   = b.paymentMethod === 'bank_transfer' ? getPaymentAccount(b.paymentAccountId) : null;
  const hoursLeft = payStatus === 'awaiting_transfer' ? hoursUntilExpiry(b) : null;

  const statusClass =
    bStatus === 'confirmed' ? styles.statusOk :
    bStatus === 'attended'  ? styles.statusAttended :
    bStatus === 'pending'   ? styles.statusPending  :
                              styles.statusCancelled;
  const statusLabel =
    bStatus === 'confirmed' ? t.admin.statusConfirmed :
    bStatus === 'attended'  ? t.admin.statusAttended  :
    bStatus === 'pending'   ? t.admin.statusPending   :
                              t.admin.statusCancelled;

  return (
    <tr
      className={
        bStatus === 'cancelled' ? styles.rowCancelled :
        bStatus === 'attended'  ? styles.rowAttended  : ''
      }
    >
      <td>
        <p className={styles.cellName}>{b.userName}</p>
        <p className={styles.cellShow}>{b.showTitle}</p>
        <p className={styles.cellShowMeta}>{b.showDate} · {b.showTime}</p>
        <a href={`mailto:${b.userEmail}`} className={styles.emailLink}>{b.userEmail}</a>
        {b.userPhone && <p className={styles.cellShowMeta}>{b.userPhone}</p>}
      </td>
      <td><a href={`mailto:${b.userEmail}`} className={styles.emailLink}>{b.userEmail}</a></td>
      <td className={styles.cellCenter}>
        {b.ticketsCount}
        <br />
        <span className={styles.badge}>
          {b.ticketType === 'student' ? t.admin.ticketStudent : t.admin.ticketStandard}
        </span>
      </td>
      <td className={styles.cellCenter}>
        <strong>{b.totalAmount ?? '—'}&nbsp;€</strong>
        {b.loyaltyDiscountApplied && (
          <>
            <br />
            <span className={styles.loyaltyBadge}>−50% скидка</span>
            {b.originalAmount && (
              <span className={styles.loyaltyOrig}>{b.originalAmount}&nbsp;€</span>
            )}
          </>
        )}
      </td>
      <td>
        <span className={styles.badge}>
          {b.paymentMethod === 'on_site' ? t.admin.payOnSite : t.admin.payTransfer}
        </span>
      </td>
      <td>
        <span className={`${styles.payBadge} ${PAY_STATUS_STYLE[payStatus]}`}>
          {PAY_STATUS_LABELS[payStatus]}
        </span>
        {account && (
          <span className={styles.payAccountLabel} title={account.description}>
            {account.label}
          </span>
        )}
        {b.paymentMethod === 'bank_transfer' && (
          <span className={styles.payRef}>
            {b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`}
          </span>
        )}
        {hoursLeft !== null && (
          <span className={hoursLeft <= 0 ? styles.payExpiredTag : styles.payCountdown}>
            {hoursLeft <= 0 ? 'Истекла' : `${hoursLeft} ч.`}
          </span>
        )}
        {bStatus !== 'cancelled' && (
          <div className={styles.payActions}>
            {payStatus !== 'paid' && payStatus !== 'expired' && (
              <button
                className={styles.actionPaid}
                disabled={isBusy}
                onClick={() => onConfirmAction({ type: 'paid', bookingId: b.id })}
              >Оплачено</button>
            )}
            {payStatus === 'paid' && (
              <button
                className={styles.actionUnpaid}
                disabled={isBusy}
                onClick={() => onConfirmAction({ type: 'unpaid', bookingId: b.id })}
              >Не оплачено</button>
            )}
          </div>
        )}
      </td>
      <td className={styles.cellMono}>{b.ticketCode || '—'}</td>
      <td className={styles.cellMono}>{formatTimestamp(b.createdAt)}</td>
      <td>
        <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
      </td>
      <td className={styles.cellComment}>
        {b.comment || '—'}
        {b.cancelledBy === 'user' && (
          <p className={styles.cancelReasonNote}>
            <span className={styles.cancelByUserBadge}>{RU.booking.cancelByUserLabel}</span>
            {b.cancelReason && <span> · {b.cancelReason}</span>}
            {b.cancelComment && <span> — {b.cancelComment}</span>}
          </p>
        )}
      </td>
      <td>
        <div className={styles.actions}>
          {bStatus !== 'cancelled' && (
            <button
              className={styles.actionCancel}
              disabled={isBusy}
              onClick={() => onConfirmAction({ type: 'cancel', bookingId: b.id })}
            >{t.admin.markCancelled}</button>
          )}
        </div>
      </td>
    </tr>
  );
}
