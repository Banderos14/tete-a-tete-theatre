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
  ticketEmailLine, type AdminPayTone,
} from './adminFormatting';
import { onlineBookingState } from '../../utils/onlinePayment';
import type { ConfirmAction, FilterShowId, FilterStatus } from './adminTypes';
import { bookingTicketLines } from '../../utils/ticketBreakdown';
import { ticketTypeLabel } from '../../utils/ticketType';
import { summarizeBookings, summarizeByShow } from './adminStats';
import { filterBookings } from '../../utils/bookingSearch';
import { formatPhoneForDisplay } from '../../utils/phoneDisplay';
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
        <>
        {/* Desktop и laptop — таблица; планшет и телефон — карточки (см. .mobileList). */}
        <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
          <table className={`${styles.table} ${styles.bookingsTable}`}>
            {/* Ширины колонок заданы здесь, а не содержимым: длинный e-mail,
                id Stripe или комментарий переносятся внутри своей колонки и не
                растягивают всю таблицу. */}
            <colgroup>
              <col className={styles.colName} />
              <col className={styles.colEmail} />
              <col className={styles.colTickets} />
              <col className={styles.colAmount} />
              <col className={styles.colMethod} />
              <col className={styles.colPayState} />
              <col className={styles.colCode} />
              <col className={styles.colDate} />
              <col className={styles.colStatus} />
              <col className={styles.colComment} />
              <col className={styles.colActions} />
            </colgroup>
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
        <div className={styles.mobileList}>
          {filtered.map(b => (
            <BookingMobileCard
              key={b.id}
              booking={b}
              isBusy={updatingId === b.id}
              onConfirmAction={onConfirmAction}
              onResendTicket={onResendTicket}
            />
          ))}
        </div>
        </>
      )}
    </>
  );
}

/**
 * E-mail с точками переноса после «@» и перед точками: длинный адрес
 * переносится по частям (anna.petrova@ / example.com), а не посреди слова.
 */
function breakableEmail(email: string) {
  return email.split(/(?<=@)|(?=\.)/).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>);
}

/**
 * id Stripe: целиком в тексте (двойной клик выделяет всё, копируется полный id),
 * но на экране — в одну строку с многоточием, чтобы не раздувать колонку.
 */
function StripeId({ id }: { id: string }) {
  return <code className={styles.stripeId} title={id}>{id}</code>;
}

/**
 * Идентификаторы Stripe — свёрнуто, для поиска платежа в Dashboard.
 * Только id и статусы: ни сумм карты, ни сырых объектов Stripe.
 *
 * Главное — платёж (pi_…): по нему администратор находит оплату и делает
 * возврат в Stripe → Transactions. Сессия Checkout (cs_…) нужна системе
 * (продолжение оплаты, истечение, сверка) и для диагностики — показана
 * мельче. Возврат — только если он есть.
 */
function StripeDetails({ booking: b }: { booking: Booking }) {
  if (!b.stripeCheckoutSessionId && !b.stripePaymentIntentId && !b.refund) return null;
  return (
    <details className={styles.stripeDetails}>
      <summary>Stripe</summary>
      {b.stripePaymentIntentId && (
        <p className={styles.stripePrimary}>Платёж: <StripeId id={b.stripePaymentIntentId} /></p>
      )}
      {b.stripeCheckoutSessionId && (
        <p className={styles.stripeSecondary}>Сессия: <StripeId id={b.stripeCheckoutSessionId} /></p>
      )}
      {b.refund && (
        <p>Возврат: <StripeId id={b.refund.id} /> · {b.refund.status} · {b.refund.amount}&nbsp;€</p>
      )}
      {b.refundedAt && <p>Возвращено: {formatTimestamp(b.refundedAt)}</p>}
      {b.paymentIssueResolved && <p>Проблема закрыта: {b.paymentIssueResolved.issue} ({b.paymentIssueResolved.via})</p>}
    </details>
  );
}

// ── Строка брони: общие блоки для таблицы (desktop) и карточки (mobile) ─────
//
// Всё, что вычисляется из брони, — в rowModel(); содержимое каждой ячейки —
// отдельный блок. Таблица и мобильная карточка собираются из одних и тех же
// блоков, поэтому правила (какие кнопки показывать, что писать про Stripe)
// живут в одном месте.

interface RowHandlers {
  isBusy: boolean;
  onConfirmAction: (a: ConfirmAction) => void;
  onResendTicket: (bookingId: string) => void;
}

function rowModel(b: Booking) {
  const payStatus: PaymentStatus = b.paymentStatus ?? 'not_paid';
  const bStatus: BookingStatus   = b.status ?? 'pending';
  // Онлайн-оплату подтверждают только Stripe и сервер (webhook, сверка):
  // ручные «Оплачено» / «Не оплачено» здесь не предлагаются — сервер их тоже
  // отклонит (online_payment). Оплаченную онлайн бронь отменяет возврат в Stripe.
  const isOnline       = b.paymentMethod === 'online';
  const online         = onlineBookingState(b);
  const issueText      = paymentIssueText(b.paymentIssue);
  const refundInStripe = isOnline && payStatus === 'paid' && bStatus !== 'cancelled';
  return {
    payStatus, bStatus, isOnline, online, issueText, refundInStripe,
    payState:      adminPaymentState(b),
    account:       b.paymentMethod === 'bank_transfer' ? getPaymentAccount(b.paymentAccountId) : null,
    hoursLeft:     payStatus === 'awaiting_transfer' ? hoursUntilExpiry(b) : null,
    deleteBlocked: bStatus === 'cancelled' ? deletionBlockedReason(b) : null,
    // «Билет отправлен: 24.09.2026, 22:18» — под кнопкой «Отправить билет».
    emailLine:     ticketEmailLine(b.emails),
    rowClass:      issueText || online === 'issue' ? styles.rowIssue : ROW_STYLE[bStatus] ?? '',
  };
}
type RowModel = ReturnType<typeof rowModel>;

function NameBlock({ b }: { b: Booking }) {
  return (
    <>
      <p className={styles.cellName}>{b.userName}</p>
      <p className={styles.cellShow}>{b.showTitle}</p>
      <p className={styles.cellShowMeta}>{b.showDate} · {b.showTime}</p>
    </>
  );
}

/** Телефон — только для показа: в базе он остаётся как был сохранён. */
function PhoneLink({ b }: { b: Booking }) {
  if (!b.userPhone) return null;
  return (
    <a href={`tel:${b.userPhone.replace(/[^\d+]/g, '')}`} className={styles.phoneLink}>
      {formatPhoneForDisplay(b.userPhone)}
    </a>
  );
}

function EmailLink({ b }: { b: Booking }) {
  return <a href={`mailto:${b.userEmail}`} className={styles.emailLink}>{breakableEmail(b.userEmail)}</a>;
}

function TicketsBlock({ b }: { b: Booking }) {
  const lines = bookingTicketLines(b);
  return (
    <div className={styles.stack}>
      <strong className={styles.cellStrong}>
        {b.ticketsCount}
        {b.seatsCount && b.seatsCount !== b.ticketsCount && <> / {b.seatsCount} мест</>}
      </strong>
      {/* Тариф; несколько тарифов в брони — по бейджу на тариф с количеством. */}
      {lines.length > 1
        ? lines.map(l => (
            <span key={l.type} className={styles.badge}>{l.quantity} × {ticketTypeLabel(l.type, 'RU')}</span>
          ))
        : <span className={styles.badge}>{ticketTypeLabel(b.ticketType, 'RU')}</span>}
    </div>
  );
}

function AmountBlock({ b }: { b: Booking }) {
  return (
    <div className={styles.stack}>
      <strong className={styles.cellStrong}>{b.totalAmount ?? '—'}&nbsp;€</strong>
      {b.loyaltyDiscountApplied && (
        <>
          <span className={styles.loyaltyBadge}>−50% на 1 билет</span>
          {b.originalAmount && <span className={styles.loyaltyOrig}>{b.originalAmount}&nbsp;€</span>}
        </>
      )}
    </div>
  );
}

function MethodBadge({ b, m }: { b: Booking; m: RowModel }) {
  return (
    <span className={`${styles.badge} ${m.isOnline ? styles.badgeOnline : ''}`}>
      {paymentMethodLabel(b.paymentMethod)}
    </span>
  );
}

function PayStateBlock({ b, m, isBusy, onConfirmAction }: { b: Booking; m: RowModel } & RowHandlers) {
  return (
    <div className={styles.stack}>
      <span className={`${styles.payBadge} ${PAY_TONE_STYLE[m.payState.tone]}`}>{m.payState.label}</span>
      {(m.issueText || m.online === 'issue') && (
        <div className={styles.payIssueBox} role="note">
          <strong>Требуется проверка оплаты</strong>
          <span>{m.issueText ?? paymentIssueText('refund_failed')}</span>
        </div>
      )}
      {m.account && (
        <span className={styles.payAccountLabel} title={m.account.description}>{m.account.label}</span>
      )}
      {b.paymentMethod === 'bank_transfer' && (
        <span className={styles.payRef}>
          {b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`}
        </span>
      )}
      {m.hoursLeft !== null && (
        <span className={m.hoursLeft <= 0 ? styles.payExpiredTag : styles.payCountdown}>
          {m.hoursLeft <= 0 ? 'Истекла' : `${m.hoursLeft} ч.`}
        </span>
      )}
      {m.isOnline && m.bStatus !== 'cancelled' && (
        <p className={styles.payNote}>Оплату подтверждает Stripe — вручную не меняется.</p>
      )}
      {m.isOnline && <StripeDetails booking={b} />}
      {m.bStatus !== 'cancelled' && !m.isOnline && (
        <div className={styles.payActions}>
          {m.payStatus !== 'paid' && m.payStatus !== 'expired' && (
            <button
              className={styles.actionPaid}
              disabled={isBusy}
              onClick={() => onConfirmAction({ type: 'paid', bookingId: b.id })}
            >Оплачено</button>
          )}
          {m.payStatus === 'paid' && m.bStatus !== 'attended' && (
            <button
              className={styles.actionUnpaid}
              disabled={isBusy}
              onClick={() => onConfirmAction({ type: 'unpaid', bookingId: b.id })}
            >Не оплачено</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Дата и время — двумя строками: одна строка шире колонки и наезжала на статус брони. */
function CreatedAt({ b }: { b: Booking }) {
  const [date, time] = formatTimestamp(b.createdAt).split(', ');
  return (
    <span className={styles.dateStack}>
      <span>{date}</span>
      {time && <span className={styles.dateTime}>{time}</span>}
    </span>
  );
}

function StatusBlock({ b, m }: { b: Booking; m: RowModel }) {
  return (
    <div className={styles.stack}>
      {/* Фолбэк на cancelled: статус вне четырёх известных (повреждённая запись
          или статус, добавленный на сервере раньше фронта) не должен
          оборачиваться пустой ячейкой — админу нечего было бы читать. */}
      <span className={`${styles.statusBadge} ${STATUS_BADGE_STYLE[m.bStatus] ?? styles.statusCancelled}`}>
        {STATUS_LABELS[m.bStatus] ?? STATUS_LABELS.cancelled}
      </span>
      {b.attendedAt && <p className={styles.cellShowMeta}>Проход: {formatTimestamp(b.attendedAt)}</p>}
      {b.paidAt && <p className={styles.cellShowMeta}>Оплата: {formatTimestamp(b.paidAt)}</p>}
    </div>
  );
}

function CommentBlock({ b }: { b: Booking }) {
  return (
    <>
      {b.comment || '—'}
      {b.cancelledBy === 'user' && (
        <p className={styles.cancelReasonNote}>
          <span className={styles.cancelByUserBadge}>{RU.booking.cancelByUserLabel}</span>
          {b.cancelReason && <span> · {b.cancelReason}</span>}
          {b.cancelComment && <span> — {b.cancelComment}</span>}
        </p>
      )}
    </>
  );
}

/** Действия — компактный блок по центру: кнопки, под ними пометки и состояние письма. */
function ActionsBlock({ b, m, isBusy, onConfirmAction, onResendTicket }: { b: Booking; m: RowModel } & RowHandlers) {
  return (
    <div className={styles.actionsBlock}>
      <div className={styles.actions}>
        {m.bStatus === 'cancelled' && m.deleteBlocked ? (
          // Финансово не закрытая бронь — след денег. Сервер тоже откажет (financial_hold).
          <p className={styles.actionNote}>Удаление недоступно: {m.deleteBlocked}.</p>
        ) : m.bStatus === 'cancelled' ? (
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
            <IconTrash size={14} stroke={1.5} aria-hidden />
          </button>
        ) : (
          <>
            {/* «Я не получил письмо»: тот же билет с тем же QR — ещё раз.
                У неоплаченной онлайн-брони билета ещё нет. */}
            {m.bStatus !== 'attended' && m.online !== 'awaiting' && (
              <button
                type="button"
                className={styles.actionResend}
                disabled={isBusy}
                onClick={() => onResendTicket(b.id)}
              >
                <IconMailForward size={13} stroke={1.5} aria-hidden="true" />
                Отправить билет
              </button>
            )}
            {m.bStatus !== 'attended' && !m.refundInStripe && (
              <button
                className={styles.actionCancel}
                disabled={isBusy}
                onClick={() => onConfirmAction({ type: 'cancel', bookingId: b.id })}
              >{t.admin.markCancelled}</button>
            )}
          </>
        )}
      </div>
      {m.refundInStripe && (
        <p className={styles.actionNote} title={t.admin.refundInStripeTitle}>{t.admin.refundInStripe}</p>
      )}
      {/* Состояние письма — сразу под кнопками, а не отдельной колонкой справа. */}
      {m.emailLine && <p className={styles.actionMeta}>{m.emailLine}</p>}
    </div>
  );
}

function BookingRow({ booking: b, ...h }: { booking: Booking } & RowHandlers) {
  const m = rowModel(b);
  return (
    <tr className={m.rowClass}>
      <td className={styles.cellWrap}><NameBlock b={b} /><PhoneLink b={b} /></td>
      <td className={styles.cellWrap}><EmailLink b={b} /></td>
      <td><TicketsBlock b={b} /></td>
      <td><AmountBlock b={b} /></td>
      <td className={styles.cellMethod}><MethodBadge b={b} m={m} /></td>
      <td className={styles.cellWrap}><PayStateBlock b={b} m={m} {...h} /></td>
      <td className={styles.cellMono}>{b.ticketCode || '—'}</td>
      <td className={`${styles.cellMono} ${styles.cellDate}`}><CreatedAt b={b} /></td>
      <td><StatusBlock b={b} m={m} /></td>
      <td className={`${styles.cellWrap} ${styles.cellComment}`}><CommentBlock b={b} /></td>
      <td className={styles.cellWrap}><ActionsBlock b={b} m={m} {...h} /></td>
    </tr>
  );
}

/**
 * Мобильная карточка брони: те же блоки, что в строке таблицы, но столбиком
 * и с подписями полей. Без горизонтального скролла.
 */
function BookingMobileCard({ booking: b, ...h }: { booking: Booking } & RowHandlers) {
  const m = rowModel(b);
  return (
    <article className={`${styles.mCard} ${m.rowClass}`}>
      <header className={styles.mHead}>
        <div className={styles.mWho}><NameBlock b={b} /></div>
        <StatusBlock b={b} m={m} />
      </header>

      <div className={styles.mContacts}>
        <PhoneLink b={b} />
        <EmailLink b={b} />
      </div>

      <dl className={styles.mGrid}>
        <div><dt>{t.admin.tickets}</dt><dd><TicketsBlock b={b} /></dd></div>
        <div><dt>{t.admin.amount}</dt><dd><AmountBlock b={b} /></dd></div>
        <div><dt>{t.admin.payment}</dt><dd><MethodBadge b={b} m={m} /></dd></div>
        <div><dt>Код брони</dt><dd className={styles.cellMono}>{b.ticketCode || '—'}</dd></div>
        <div className={styles.mWide}><dt>{t.admin.paymentStatus}</dt><dd><PayStateBlock b={b} m={m} {...h} /></dd></div>
        <div><dt>{t.admin.date}</dt><dd className={styles.cellMono}><CreatedAt b={b} /></dd></div>
        {(b.comment || b.cancelledBy === 'user') && (
          <div className={styles.mWide}><dt>{t.admin.comment}</dt><dd className={styles.cellComment}><CommentBlock b={b} /></dd></div>
        )}
      </dl>

      <ActionsBlock b={b} m={m} {...h} />
    </article>
  );
}
