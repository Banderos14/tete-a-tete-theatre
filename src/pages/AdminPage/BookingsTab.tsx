// Вкладка «Брони»: сводка по кассе, карточки спектаклей-фильтров и таблица.

import { useState } from 'react';
import { IconMailForward, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { RU } from '../../i18n';
import { hoursUntilExpiry } from '../../services/bookingService';
import { getPaymentAccount, PAYMENT_CONFIG } from '../../config/payment';
import { SHOWS } from '../../data/shows';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import {
  formatTimestamp, adminPaymentState, paymentMethodLabel, paymentIssueText, deletionBlockedReason,
  type AdminPayTone,
} from './adminFormatting';
import { onlineBookingState } from '../../utils/onlinePayment';
import type { ConfirmAction, FilterShowId, FilterStatus } from './adminTypes';
import { ticketTypeLabel } from '../../utils/ticketType';
import { summarizeBookings, summarizeByShow } from './adminStats';
import { filterBookings } from '../../utils/bookingSearch';
import { AdminShowCard } from './AdminShowCard';
import styles from './AdminPage.module.scss';

const PAY_TONE_STYLE: Record<AdminPayTone, string> = {
  notPaid:  styles.payNotPaid,
  awaiting: styles.payAwaiting,
  paid:     styles.payPaid,
  expired:  styles.payExpired,
  issue:    styles.payIssue,
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

export function BookingsTab({
  bookings, fetching, updatingId,
  actionError, actionNotice, onDismissActionError, onReload, onResendTicket,
  filterShow, onFilterShow, filterStatus, onFilterStatus,
  onConfirmAction,
}: {
  bookings: Booking[];
  fetching: boolean;
  updatingId: string | null;
  actionError: string | null;
  actionNotice: string | null;
  onDismissActionError: () => void;
  onReload: () => void;
  onResendTicket: (bookingId: string) => void;
  filterShow: FilterShowId;
  onFilterShow: (v: FilterShowId | ((prev: FilterShowId) => FilterShowId)) => void;
  filterStatus: FilterStatus;
  onFilterStatus: (v: FilterStatus) => void;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  // Строка поиска: имя, e-mail, телефон или код брони — по уже загруженному списку.
  const [search, setSearch] = useState('');
  const filtered = filterBookings(bookings, search)
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
        {statsByShow.map(stats => (
          <AdminShowCard
            key={stats.show.id}
            stats={stats}
            active={filterShow === stats.show.id}
            onToggle={() => onFilterShow(prev => prev === stats.show.id ? 'all' : stats.show.id)}
          />
        ))}
      </div>

      <div className={styles.searchRow}>
        <label className={styles.searchField}>
          <IconSearch size={16} stroke={1.5} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Имя, e-mail, телефон или код брони"
            aria-label="Поиск брони"
            enterKeyHint="search"
          />
        </label>
        <button
          type="button"
          className={styles.reloadBtn}
          onClick={onReload}
          disabled={fetching}
          title="Обновить список"
          aria-label="Обновить список"
        >
          <IconRefresh size={16} stroke={1.5} aria-hidden="true" />
        </button>
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

      {actionError && (
        <div className={styles.adminError} role="alert">
          {actionError}
          <button className={styles.errorDismiss} onClick={onDismissActionError} aria-label="Скрыть">×</button>
        </div>
      )}
      {!actionError && actionNotice && (
        <div className={styles.adminNotice} role="status">
          {actionNotice}
          <button className={styles.errorDismiss} onClick={onDismissActionError} aria-label="Скрыть">×</button>
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
                  onResendTicket={onResendTicket}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Оплаченную онлайн бронь нельзя просто отменить: место держат деньги в Stripe. */
const REFUND_IN_STRIPE_HINT =
  'Оплачено онлайн: отмена — через возврат в Stripe Dashboard (Payments → платёж → Refund). '
  + 'Бронь отменится автоматически.';

/**
 * Идентификаторы Stripe — свёрнуто, для поиска платежа в Dashboard.
 * Только id и статусы: ни сумм карты, ни сырых объектов Stripe.
 */
function StripeDetails({ booking: b }: { booking: Booking }) {
  if (!b.stripeCheckoutSessionId && !b.stripePaymentIntentId && !b.refund) return null;
  return (
    <details className={styles.stripeDetails}>
      <summary>Stripe</summary>
      {b.stripePaymentIntentId && <p>Платёж: <code>{b.stripePaymentIntentId}</code></p>}
      {b.stripeCheckoutSessionId && <p>Сессия: <code>{b.stripeCheckoutSessionId}</code></p>}
      {b.refund && (
        <p>Возврат: <code>{b.refund.id}</code> · {b.refund.status} · {b.refund.amount}&nbsp;€</p>
      )}
      {b.refundedAt && <p>Возвращено: {formatTimestamp(b.refundedAt)}</p>}
      {b.paymentIssueResolved && <p>Проблема закрыта: {b.paymentIssueResolved.issue} ({b.paymentIssueResolved.via})</p>}
    </details>
  );
}

/** Последнее письмо-билет по брони — чтобы на «я не получил письмо» было что ответить. */
function lastTicketEmail(b: Booking): string | null {
  const entries = Object.entries(b.emails ?? {}).filter(([k]) => k !== 'cancelled');
  if (entries.length === 0) return null;
  const [, last] = entries.sort(([, x], [, y]) => (y?.atMs ?? 0) - (x?.atMs ?? 0))[0]!;
  if (!last) return null;
  const when = new Date(last.atMs).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const label = { sent: 'отправлен', failed: 'НЕ ушёл', skipped: 'не отправлялся', sending: 'отправляется' }[last.status];
  return `Билет: ${label}, ${when}`;
}

function BookingRow({ booking: b, isBusy, onConfirmAction, onResendTicket }: {
  booking: Booking;
  isBusy: boolean;
  onConfirmAction: (a: ConfirmAction) => void;
  onResendTicket: (bookingId: string) => void;
}) {
  const emailLine = lastTicketEmail(b);
  const payStatus: PaymentStatus = b.paymentStatus ?? 'not_paid';
  const bStatus: BookingStatus   = b.status ?? 'pending';
  const account   = b.paymentMethod === 'bank_transfer' ? getPaymentAccount(b.paymentAccountId) : null;
  const hoursLeft = payStatus === 'awaiting_transfer' ? hoursUntilExpiry(b) : null;

  // Онлайн-оплату подтверждают только Stripe и сервер (webhook, сверка):
  // ручные «Оплачено» / «Не оплачено» здесь не предлагаются — сервер их тоже
  // отклонит (online_payment). Оплаченную онлайн бронь отменяет возврат в Stripe.
  const isOnline      = b.paymentMethod === 'online';
  const online        = onlineBookingState(b);
  const payState      = adminPaymentState(b);
  const issueText     = paymentIssueText(b.paymentIssue);
  const refundInStripe = isOnline && payStatus === 'paid' && bStatus !== 'cancelled';
  const deleteBlocked = bStatus === 'cancelled' ? deletionBlockedReason(b) : null;
  const rowClass      = issueText || online === 'issue' ? styles.rowIssue : ROW_STYLE[bStatus] ?? '';

  return (
    <tr className={rowClass}>
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
            <span className={styles.loyaltyBadge}>−50% на 1 билет</span>
            {b.originalAmount && (
              <span className={styles.loyaltyOrig}>{b.originalAmount}&nbsp;€</span>
            )}
          </>
        )}
      </td>
      <td>
        <span className={`${styles.badge} ${isOnline ? styles.badgeOnline : ''}`}>
          {paymentMethodLabel(b.paymentMethod)}
        </span>
      </td>
      <td>
        <span className={`${styles.payBadge} ${PAY_TONE_STYLE[payState.tone]}`}>
          {payState.label}
        </span>
        {(issueText || online === 'issue') && (
          <div className={styles.payIssueBox} role="note">
            <strong>Требуется проверка оплаты</strong>
            <span>{issueText ?? paymentIssueText('refund_failed')}</span>
          </div>
        )}
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
        {isOnline && bStatus !== 'cancelled' && (
          <p className={styles.payNote}>Оплату подтверждает Stripe — вручную не меняется.</p>
        )}
        {isOnline && <StripeDetails booking={b} />}
        {bStatus !== 'cancelled' && !isOnline && (
          <div className={styles.payActions}>
            {payStatus !== 'paid' && payStatus !== 'expired' && (
              <button
                className={styles.actionPaid}
                disabled={isBusy}
                onClick={() => onConfirmAction({ type: 'paid', bookingId: b.id })}
              >Оплачено</button>
            )}
            {payStatus === 'paid' && bStatus !== 'attended' && (
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
        {b.attendedAt && <p className={styles.cellShowMeta}>Проход: {formatTimestamp(b.attendedAt)}</p>}
        {b.paidAt && <p className={styles.cellShowMeta}>Оплата: {formatTimestamp(b.paidAt)}</p>}
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
          {bStatus === 'cancelled' && deleteBlocked ? (
            // Финансово не закрытая бронь — след денег. Сервер тоже откажет (financial_hold).
            <p className={styles.payNote}>Удаление недоступно: {deleteBlocked}.</p>
          ) : bStatus === 'cancelled' ? (
            // Удалить можно только отменённую бронь — то же правило проверяет
            // сервер (/api/admin-booking, действие delete), кнопка лишь не предлагает лишнего.
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
            <>
              {/* «Я не получил письмо»: тот же билет с тем же QR — ещё раз.
                  У неоплаченной онлайн-брони билета ещё нет. */}
              {bStatus !== 'attended' && online !== 'awaiting' && (
                <button
                  type="button"
                  className={styles.actionResend}
                  disabled={isBusy}
                  onClick={() => onResendTicket(b.id)}
                >
                  <IconMailForward size={16} stroke={1.5} aria-hidden="true" />
                  Отправить билет
                </button>
              )}
              {bStatus !== 'attended' && !refundInStripe && (
                <button
                  className={styles.actionCancel}
                  disabled={isBusy}
                  onClick={() => onConfirmAction({ type: 'cancel', bookingId: b.id })}
                >{t.admin.markCancelled}</button>
              )}
              {refundInStripe && (
                <p className={styles.payNote}>{REFUND_IN_STRIPE_HINT}</p>
              )}
            </>
          )}
        </div>
        {emailLine && <p className={styles.cellShowMeta}>{emailLine}</p>}
      </td>
    </tr>
  );
}
