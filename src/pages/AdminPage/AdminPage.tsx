import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../i18n/LangContext';
import { getAllBookings, updateBookingStatus, updatePaymentStatus } from '../../services/bookingService';
import { getAllUsers } from '../../services/userService';
import { SHOWS } from '../../data/shows';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import type { AdminUser } from '../../services/userService';
import styles from './AdminPage.module.scss';

type FilterShowId    = 'all' | string;
type FilterStatus    = 'all' | BookingStatus;
type AdminTab        = 'bookings' | 'users';

function formatTimestamp(ts: unknown): string {
  if (!ts) return '—';
  try {
    const t = ts as { toDate?: () => Date; seconds?: number };
    const date = t.toDate ? t.toDate() : new Date((t.seconds ?? 0) * 1000);
    return date.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

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

  const [tab,         setTab]         = useState<AdminTab>('bookings');
  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [filterShow,  setFilterShow]  = useState<FilterShowId>('all');
  const [filterStatus,setFilterStatus]= useState<FilterStatus>('all');
  const [fetching,    setFetching]    = useState(true);
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      const timer = setTimeout(() => navigate('/'), 1500);
      return () => clearTimeout(timer);
    }
    fetchAll();
  }, [loading, isAdmin, navigate]);

  async function fetchAll() {
    setFetching(true);
    try {
      const [bData, uData] = await Promise.all([getAllBookings(), getAllUsers()]);
      setBookings(bData);
      setUsers(uData);
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

  // ── Filtered bookings ───────────────────────────────────────────────────────

  const filtered = bookings
    .filter(b => filterShow  === 'all' || b.showId === filterShow)
    .filter(b => filterStatus === 'all' || b.status === filterStatus);

  // ── Per-show stats ──────────────────────────────────────────────────────────

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

  const BOOKING_STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: 'all',       label: 'Все' },
    { value: 'pending',   label: t.admin.statusPending },
    { value: 'confirmed', label: t.admin.statusConfirmed },
    { value: 'attended',  label: t.admin.statusAttended },
    { value: 'cancelled', label: t.admin.statusCancelled },
  ];

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

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'bookings' ? styles.tabActive : ''}`}
          onClick={() => setTab('bookings')}
        >{t.admin.bookingsTab}</button>
        <button
          className={`${styles.tabBtn} ${tab === 'users' ? styles.tabActive : ''}`}
          onClick={() => setTab('users')}
        >{t.admin.usersTab} ({users.length})</button>
      </div>

      {/* ── BOOKINGS TAB ── */}
      {tab === 'bookings' && (
        <>
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
                className={`${styles.showCard} ${filterShow === show.id ? styles.showCardActive : ''}`}
                onClick={() => setFilterShow(prev => prev === show.id ? 'all' : show.id)}
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

          {/* Filters row */}
          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              {filterShow !== 'all' && (
                <>
                  <span className={styles.filterLabel}>
                    {SHOWS.find(s => s.id === filterShow)?.title ?? filterShow}
                  </span>
                  <button className={styles.clearFilter} onClick={() => setFilterShow('all')}>×</button>
                </>
              )}
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{t.admin.filterByStatus}</span>
              {BOOKING_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.statusFilterBtn} ${filterStatus === opt.value ? styles.statusFilterActive : ''}`}
                  onClick={() => setFilterStatus(opt.value)}
                >{opt.label}</button>
              ))}
            </div>
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
                    const bStatus   = b.status ?? 'pending';
                    const isBusy    = updatingId === b.id;
                    return (
                      <tr
                        key={b.id}
                        className={
                          bStatus === 'cancelled' ? styles.rowCancelled :
                          bStatus === 'attended'  ? styles.rowAttended  : ''
                        }
                      >
                        <td>
                          <p className={styles.cellName}>{b.userName}</p>
                          {filterShow === 'all' && (
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
                            disabled={isBusy || bStatus === 'cancelled'}
                            onChange={e => handlePaymentStatus(b.id, e.target.value as PaymentStatus)}
                          >
                            {(Object.keys(PAY_STATUS_LABELS) as PaymentStatus[]).map(ps => (
                              <option key={ps} value={ps}>{PAY_STATUS_LABELS[ps]}</option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.cellMono}>{formatTimestamp(b.createdAt)}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${
                            bStatus === 'confirmed' ? styles.statusOk :
                            bStatus === 'attended'  ? styles.statusAttended :
                            bStatus === 'pending'   ? styles.statusPending  :
                                                      styles.statusCancelled
                          }`}>
                            {bStatus === 'confirmed' ? t.admin.statusConfirmed :
                             bStatus === 'attended'  ? t.admin.statusAttended  :
                             bStatus === 'pending'   ? t.admin.statusPending   :
                                                      t.admin.statusCancelled}
                          </span>
                        </td>
                        <td className={styles.cellComment}>{b.comment || '—'}</td>
                        <td>
                          <div className={styles.actions}>
                            {bStatus !== 'confirmed' && bStatus !== 'attended' && (
                              <button
                                className={styles.actionConfirm}
                                disabled={isBusy}
                                onClick={() => handleStatus(b.id, 'confirmed')}
                              >{t.admin.markConfirmed}</button>
                            )}
                            {bStatus !== 'attended' && bStatus !== 'cancelled' && (
                              <button
                                className={styles.actionAttended}
                                disabled={isBusy}
                                onClick={() => handleStatus(b.id, 'attended')}
                              >{t.admin.markAttended}</button>
                            )}
                            {bStatus !== 'cancelled' && (
                              <button
                                className={styles.actionCancel}
                                disabled={isBusy}
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
        </>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryNum}>{users.length}</span>
              <span className={styles.summaryLabel}>{t.admin.usersCount}</span>
            </div>
          </div>

          {fetching ? (
            <div className={styles.centered}><span className={styles.spinner} /></div>
          ) : users.length === 0 ? (
            <p className={styles.empty}>{t.admin.noUsers}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t.admin.name}</th>
                    <th>{t.admin.email}</th>
                    <th>{t.admin.phone}</th>
                    <th>Роль</th>
                    <th>Уведомления</th>
                    <th>{t.admin.userCreatedAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.uid}>
                      <td className={styles.cellName}>{u.displayName || '—'}</td>
                      <td><a href={`mailto:${u.email}`} className={styles.emailLink}>{u.email}</a></td>
                      <td>{u.phone || '—'}</td>
                      <td>
                        <span className={`${styles.badge} ${u.role === 'admin' ? styles.badgeAdmin : ''}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className={styles.cellCenter}>{u.notifications ? '✓' : '—'}</td>
                      <td className={styles.cellMono}>{formatTimestamp(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </div>
  );
}
