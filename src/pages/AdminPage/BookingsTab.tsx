// Вкладка «Брони»: сводка по кассе, карточки спектаклей-фильтров и таблица.

import { IconTrash } from '@tabler/icons-react';
import { RU } from '../../i18n';
import { hoursUntilExpiry } from '../../services/bookingService';
import { getPaymentAccount, PAYMENT_CONFIG } from '../../config/payment';
import { SHOWS } from '../../data/shows';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import { formatTimestamp, PAY_STATUS_LABELS } from './adminFormatting';
import type { ConfirmAction, FilterShowId, FilterStatus } from './adminTypes';
import { ticketTypeLabel } from '../../utils/ticketType';
import { summarizeBookings, summarizeByShow } from './adminStats';
import styles from './AdminPage.module.scss';

const PAY_STATUS_STYLE: Record<PaymentStatus, string> = {
  not_paid:          styles.payNotPaid,
  awaiting_transfer: styles.payAwaiting,
  paid:              styles.payPaid,
  expired:           styles.payExpired,
};

const t = RU;

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   t.admin.statusPending,
  confirmed: t.admin.statusConfirmed,
  attended:  t.admin.statusAttended,
  cancelled: t.admin.statusCancelled,
};

const STATUS_BADGE_STYLE: Record<BookingStatus, string> = {
  pending:   styles.statusPending,
  confirmed: styles.statusOk,
  attended:  styles.statusAttended,
  cancelled: styles.statusCancelled,
};

/** Подсветку получает вся строка — но только у отменённых и посещённых броней. */
const ROW_STYLE: Partial<Record<BookingStatus, string>> = {
  cancelled: styles.rowCancelled,
  attended:  styles.rowAttended,
};

const BOOKING_STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all',       label: 'Все' },
  { value: 'pending',   label: STATUS_LABELS.pending },
  { value: 'confirmed', label: STATUS_LABELS.confirmed },
  { value: 'attended',  label: STATUS_LABELS.attended },
  { value: 'cancelled', label: STATUS_LABELS.cancelled },
];

/** Инициалы спектакля для карточки без афиши. */
function showGlyph(title: string): string {
  return title.replace(/[«»]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function BookingsTab({
  bookings, fetching, updatingId,
  deleteError, onDismissDeleteError,
  filterShow, onFilterShow, filterStatus, onFilterStatus,
  onConfirmAction,
}: {
  bookings: Booking[];
  fetching: boolean;
  updatingId: string | null;
  deleteError: string | null;
  onDismissDeleteError: () => void;
  filterShow: FilterShowId;
  onFilterShow: (v: FilterShowId | ((prev: FilterShowId) => FilterShowId)) => void;
  filterStatus: FilterStatus;
  onFilterStatus: (v: FilterStatus) => void;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  const filtered = bookings
    .filter(b => filterShow  === 'all' || b.showId === filterShow)
    .filter(b => filterStatus === 'all' || b.status === filterStatus);

  // Сводка пересчитывается из текущего списка броней на каждом рендере: когда
  // админ отменяет бронь, useAdminData меняет её статус в состоянии — и цифры
  // обновляются сразу, без перезагрузки и без отдельного listener'а.
  const statsByShow = summarizeByShow(SHOWS, bookings);
  const total       = summarizeBookings(bookings);

  return (
    <>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{total.bookings}</span>
          <span className={styles.summaryLabel}>{t.admin.bookings}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{total.tickets}</span>
          <span className={styles.summaryLabel}>{t.admin.totalTickets}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{total.revenue}&nbsp;€</span>
          <span className={styles.summaryLabel}>{t.admin.totalRevenue}</span>
        </div>
      </div>

      <div className={styles.showStats}>
        {statsByShow.map(({ show, bookings: count, tickets, revenue }) => (
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

      {deleteError && (
        <div className={styles.adminError}>
          <strong>Ошибка удаления:</strong> {deleteError}
          <button className={styles.errorDismiss} onClick={onDismissDeleteError}>×</button>
        </div>
      )}

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

  return (
    <tr className={ROW_STYLE[bStatus] ?? ''}>
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
        {b.seatsCount && b.seatsCount !== b.ticketsCount && <> / {b.seatsCount} мест</>}
        <br />
        <span className={styles.badge}>
          {ticketTypeLabel(b.ticketType, 'RU')}
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
        {/* Фолбэк на cancelled: статус вне четырёх известных (повреждённая запись
            или статус, добавленный на сервере раньше фронта) не должен
            оборачиваться пустой ячейкой — админу нечего было бы читать. */}
        <span className={`${styles.statusBadge} ${STATUS_BADGE_STYLE[bStatus] ?? styles.statusCancelled}`}>
          {STATUS_LABELS[bStatus] ?? STATUS_LABELS.cancelled}
        </span>
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
          {bStatus === 'cancelled' ? (
            // Удалить можно только отменённую бронь — то же правило проверяет
            // сервер в /api/delete-booking, кнопка лишь не предлагает лишнего.
            <button
              type="button"
              className={styles.actionDelete}
              disabled={isBusy}
              title="Удалить бронь"
              aria-label="Удалить бронь"
              onClick={() => onConfirmAction({ type: 'deleteBooking', bookingId: b.id })}
            >
              <IconTrash size={16} stroke={1.5} aria-hidden />
            </button>
          ) : (
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
