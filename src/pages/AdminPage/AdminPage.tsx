import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LangContext';
import { getAllBookings, updateBookingStatus, updatePaymentStatus } from '../../services/bookingService';
import { SHOWS } from '../../data/shows';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import styles from './AdminPage.module.scss';

type FilterShowId = 'all' | string;

function formatDate(booking: Booking): string {
  if (!booking.createdAt) return '—';
  try {
    const ts = booking.createdAt as { toDate?: () => Date; seconds?: number };
    const date = ts.toDate ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000);
    return date.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// Payment status badge config
const PAY_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_paid:          'Не оплачено',
  awaiting_transfer: 'Ожидает перевода',
  paid:              'Оплачено',
};

const PAY_STATUS_STYLE: Record<PaymentStatus, string> = {
  not_paid:          styles.payNotPaid,
  awaiting_transfer: styles.payAwaiting,
  paid:              styles.payPaid,
};

export function AdminPage() {
  const navigate    = useNavigate();
  const { t }       = useLang();
  const { userProfile, loading } = useAuth();

  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [filter,      setFilter]      = useState<FilterShowId>('all');
  const [fetching,    setFetching]    = useState(true);
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) return;
    fetchAll();
  }, [loading, isAdmin]);

  async function fetchAll() {
    setFetching(true);
    try {
      const data = await getAllBookings();
      setBookings(data);
    } finally {
      setFetching(false);
    }
  }

  async function handleStatus(bookingId: string, status: BookingStatus) {
    setUpdatingId(bookingId);
    try {
      await updateBookingStatus(bookingId, status);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
    } finally { setUpdatingId(null); }
  }

  async function handlePaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    setUpdatingId(bookingId);
    try {
      await updatePaymentStatus(bookingId, paymentStatus);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, paymentStatus } : b));
    } finally { setUpdatingId(null); }
  }

  // ── Access control ──────────────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.centered}><span className={styles.spinner} /></div>;
  }

  if (!isAdmin) {
    return (
      <div className={styles.centered}>
        <p className={styles.accessDenied}>{t.admin.accessDenied}</p>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          {t.admin.backToSite}
        </button>
      </div>
    );
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const filtered = filter === 'all'
    ? bookings
    : bookings.filter(b => b.showId === filter);

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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* Top bar */}
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>{t.admin.title}</h1>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          {t.admin.backToSite}
        </button>
      </div>

      {/* Summary cards */}
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

      {/* Per-show stats */}
      <div className={styles.showStats}>
        {statsByShow.map(({ show, count, tickets, revenue }) => (
          <button
            key={show.id}
            className={`${styles.showCard} ${filter === show.id ? styles.showCardActive : ''}`}
            onClick={() => setFilter(prev => prev === show.id ? 'all' : show.id)}
          >
            <span className={styles.showCardGlyph} style={{ background: show.palette }}>
              {show.glyph}
            </span>
            <div className={styles.showCardInfo}>
              <p className={styles.showCardTitle}>{show.title}</p>
              <p className={styles.showCardMeta}>
                {count} {t.admin.bookings} · {tickets} {t.admin.totalTickets} · {revenue}&nbsp;€ {t.admin.totalRevenue}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Filter label */}
      <div className={styles.tableHeader}>
        <p className={styles.tableTitle}>
          {filter === 'all'
            ? t.admin.filterAll
            : SHOWS.find(s => s.id === filter)?.title ?? filter}
        </p>
        {filter !== 'all' && (
          <button className={styles.clearFilter} onClick={() => setFilter('all')}>
            × {t.admin.filterAll}
          </button>
        )}
      </div>

      {/* Bookings table */}
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
                <th>{t.admin.phone}</th>
                <th>{t.admin.tickets}</th>
                <th>{t.admin.ticketType}</th>
                <th>{t.admin.amount}</th>
                <th>{t.admin.payment}</th>
                <th>{t.admin.paymentStatus}</th>
                <th>{t.admin.date}</th>
                <th>{t.admin.status}</th>
                <th>{t.admin.comment}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const payStatus: PaymentStatus = b.paymentStatus ?? 'not_paid';
                return (
                  <tr key={b.id} className={b.status === 'cancelled' ? styles.rowCancelled : ''}>
                    <td>
                      <p className={styles.cellName}>{b.userName}</p>
                      {filter === 'all' && (
                        <p className={styles.cellShow}>{b.showTitle}</p>
                      )}
                    </td>
                    <td><a href={`mailto:${b.userEmail}`} className={styles.emailLink}>{b.userEmail}</a></td>
                    <td>{b.userPhone || '—'}</td>
                    <td className={styles.cellCenter}>{b.ticketsCount}</td>
                    <td>
                      <span className={styles.badge}>
                        {b.ticketType === 'student' ? t.admin.ticketStudent : t.admin.ticketStandard}
                      </span>
                    </td>
                    <td className={styles.cellCenter}>
                      <strong>{b.totalAmount ?? '—'}&nbsp;€</strong>
                    </td>
                    <td>
                      <span className={styles.badge}>
                        {b.paymentMethod === 'on_site' ? t.admin.payOnSite : t.admin.payTransfer}
                      </span>
                    </td>
                    <td>
                      <select
                        className={`${styles.paySelect} ${PAY_STATUS_STYLE[payStatus]}`}
                        value={payStatus}
                        disabled={updatingId === b.id || b.status === 'cancelled'}
                        onChange={e => handlePaymentStatus(b.id, e.target.value as PaymentStatus)}
                      >
                        {(Object.keys(PAY_STATUS_LABELS) as PaymentStatus[]).map(ps => (
                          <option key={ps} value={ps}>{PAY_STATUS_LABELS[ps]}</option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.cellMono}>{formatDate(b)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${b.status === 'confirmed' ? styles.statusOk : styles.statusCancelled}`}>
                        {b.status === 'confirmed' ? t.admin.statusConfirmed : t.admin.statusCancelled}
                      </span>
                    </td>
                    <td className={styles.cellComment}>{b.comment || '—'}</td>
                    <td>
                      <div className={styles.actions}>
                        {b.status !== 'confirmed' && (
                          <button
                            className={styles.actionConfirm}
                            disabled={updatingId === b.id}
                            onClick={() => handleStatus(b.id, 'confirmed')}
                          >{t.admin.markConfirmed}</button>
                        )}
                        {b.status !== 'cancelled' && (
                          <button
                            className={styles.actionCancel}
                            disabled={updatingId === b.id}
                            onClick={() => handleStatus(b.id, 'cancelled')}
                          >{t.admin.markCancelled}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
