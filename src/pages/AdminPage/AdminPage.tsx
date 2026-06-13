import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RU } from '../../i18n';
import { getAllBookings, updateBookingStatus, updatePaymentStatus, markBookingPaid, expireOverdueBookings, hoursUntilExpiry } from '../../services/bookingService';
import { getPaymentAccount, PAYMENT_CONFIG } from '../../config/payment';
import { markEligibleBookingsAsAttended } from '../../services/attendanceService';
import { getAllUsers, getUsersForNewsletter, deleteUserCompletely } from '../../services/userService';
import { sendBookingStatusUpdateEmail, sendPaymentPaidEmail, sendNewShowAnnouncementEmail } from '../../services/emailService';
import { SHOWS } from '../../data/shows';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import type { AdminUser } from '../../services/userService';
import styles from './AdminPage.module.scss';

type FilterShowId    = 'all' | string;
type FilterStatus    = 'all' | BookingStatus;
type AdminTab        = 'bookings' | 'users' | 'newsletter';
type ConfirmAction   =
  | { type: 'paid';       bookingId: string }
  | { type: 'unpaid';     bookingId: string }
  | { type: 'cancel';     bookingId: string }
  | { type: 'deleteUser'; uid: string; displayName: string }
  | null;

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
  expired:           'Истекло',
};

const PAY_STATUS_STYLE: Record<PaymentStatus, string> = {
  not_paid:          styles.payNotPaid,
  awaiting_transfer: styles.payAwaiting,
  paid:              styles.payPaid,
  expired:           styles.payExpired,
};

export function AdminPage() {
  const navigate    = useNavigate();
  const t           = RU;
  const { user, userProfile, loading } = useAuth();

  const [tab,         setTab]         = useState<AdminTab>('bookings');
  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [filterShow,  setFilterShow]  = useState<FilterShowId>('all');
  const [filterStatus,setFilterStatus]= useState<FilterStatus>('all');
  const [fetching,    setFetching]    = useState(true);
  const [updatingId,     setUpdatingId]     = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
  const [confirmAction,  setConfirmAction]  = useState<ConfirmAction>(null);

  const [nlShowId,    setNlShowId]    = useState<string>(SHOWS[0]?.id ?? '');
  const [nlSending,   setNlSending]   = useState(false);
  const [nlResult,    setNlResult]    = useState<{ sent: number; errors: string[] } | null>(null);

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
      // Автоматически отмечаем прошедшие оплаченные спектакли, не блокируя загрузку.
      markEligibleBookingsAsAttended(bData, (id) => {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'attended' } : b));
      }).catch(() => {});

      // Просроченные банковские переводы отменяются фоном.
      expireOverdueBookings(bData, (id) => {
        setBookings(prev => prev.map(b =>
          b.id === id ? { ...b, paymentStatus: 'expired', status: 'cancelled' } : b,
        ));
      }).catch(() => {});
    } finally {
      setFetching(false);
    }
  }

  async function handleStatus(bookingId: string, status: BookingStatus) {
    const booking = bookings.find(b => b.id === bookingId);
    // Если статус не изменился, письмо повторно не отправляем.
    if (!booking || booking.status === status) return;

    setUpdatingId(bookingId);
    try {
      await updateBookingStatus(bookingId, status);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));

      // Письма отправляются только для ручного подтверждения и отмены.
      if (status === 'confirmed' || status === 'cancelled') {
        sendBookingStatusUpdateEmail({
          userEmail:    booking.userEmail,
          userName:     booking.userName,
          showTitle:    booking.showTitle,
          showDate:     booking.showDate,
          showTime:     booking.showTime,
          ticketsCount: booking.ticketsCount,
          totalAmount:  booking.totalAmount,
          ticketCode:   booking.ticketCode,
          newStatus:    status,
          lang:         booking.lang ?? 'FR',
        }).catch(() => {});
      }
    } finally { setUpdatingId(null); }
  }

  async function handlePaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    const booking = bookings.find(b => b.id === bookingId);
    // Если статус оплаты не изменился, письмо повторно не отправляем.
    if (!booking || (booking.paymentStatus ?? 'not_paid') === paymentStatus) return;

    setUpdatingId(bookingId);
    try {
      if (paymentStatus === 'paid') {
        // Оплата и подтверждение должны записываться одним обновлением.
        await markBookingPaid(bookingId);
        setBookings(prev => prev.map(b =>
          b.id === bookingId ? { ...b, paymentStatus: 'paid', status: 'confirmed' } : b
        ));
        // Одно письмо на получение оплаты.
        sendPaymentPaidEmail({
          userEmail:     booking.userEmail,
          userName:      booking.userName,
          showTitle:     booking.showTitle,
          showDate:      booking.showDate,
          showTime:      booking.showTime,
          ticketsCount:  booking.ticketsCount,
          totalAmount:   booking.totalAmount,
          ticketCode:    booking.ticketCode,
          bookingStatus: 'confirmed',
          lang:          booking.lang ?? 'FR',
        }).catch(() => {});
      } else {
        // Снятие оплаты меняет только paymentStatus и не отправляет письмо.
        await updatePaymentStatus(bookingId, paymentStatus);
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, paymentStatus } : b));
      }
    } finally { setUpdatingId(null); }
  }

  async function handleNewsletter() {
    const show = SHOWS.find(s => s.id === nlShowId);
    if (!show) return;

    const recipients = await getUsersForNewsletter();
    if (recipients.length === 0) {
      setNlResult({ sent: 0, errors: [] });
      return;
    }

    const confirmed = window.confirm(
      `Будет отправлено ${recipients.length} писем${recipients.length > 100 ? '\n\n⚠️ Больше 100 получателей — проверьте лимиты Resend.' : ''}. Продолжить?`
    );
    if (!confirmed) return;

    setNlSending(true);
    setNlResult(null);

    const errors: string[] = [];
    let sent = 0;
    const showDate = `${show.day} ${show.month} ${show.year}`;

    for (const recipient of recipients) {
      try {
        await sendNewShowAnnouncementEmail({
          userEmail:   recipient.email,
          userName:    recipient.displayName || recipient.email,
          showTitle:   show.titleFR ?? show.title,
          showDate,
          showTime:    show.time,
          price:       show.priceFR ?? show.price,
          description: show.descFR ?? show.desc,
          siteUrl:     window.location.origin,
          lang:        'FR',
        });
        sent++;
      } catch {
        errors.push(recipient.email);
      }
    }

    setNlSending(false);
    setNlResult({ sent, errors });
  }

  async function handleDeleteUser(uid: string) {
    setUpdatingUserId(uid);
    setDeleteUserError(null);
    try {
      const result = await deleteUserCompletely(uid);
      setUsers(prev => prev.filter(u => u.uid !== uid));
      if (result.bookingsDeletedCount > 0) {
        setBookings(prev => prev.filter(b => b.userId !== uid));
      }
    } catch (e) {
      setDeleteUserError(e instanceof Error ? e.message : 'Ошибка удаления пользователя');
    } finally {
      setUpdatingUserId(null);
    }
  }

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

  const BOOKING_STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: 'all',       label: 'Все' },
    { value: 'pending',   label: t.admin.statusPending },
    { value: 'confirmed', label: t.admin.statusConfirmed },
    { value: 'attended',  label: t.admin.statusAttended },
    { value: 'cancelled', label: t.admin.statusCancelled },
  ];

  return (
    <div className={styles.page}>

      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>{t.admin.title}</h1>
        <div className={styles.topBarActions}>
          <button className={styles.checkinBtn} onClick={() => navigate('/admin/checkin')}>
            Проверка билетов
          </button>
          <button className={styles.backBtn} onClick={() => navigate('/')}>
            {t.admin.backToSite}
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'bookings' ? styles.tabActive : ''}`}
          onClick={() => setTab('bookings')}
        >{t.admin.bookingsTab}</button>
        <button
          className={`${styles.tabBtn} ${tab === 'users' ? styles.tabActive : ''}`}
          onClick={() => setTab('users')}
        >{t.admin.usersTab} ({users.length})</button>
        <button
          className={`${styles.tabBtn} ${tab === 'newsletter' ? styles.tabActive : ''}`}
          onClick={() => { setTab('newsletter'); setNlResult(null); }}
        >Рассылка</button>
      </div>

      {tab === 'bookings' && (
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
                onClick={() => setFilterShow(prev => prev === show.id ? 'all' : show.id)}
              >
                {show.image ? (
                  <img src={show.image} alt={show.title} className={styles.showCardImg} />
                ) : (
                  <span className={styles.showCardGlyph} style={{ background: show.palette }}>
                    {show.title.replace(/[«»]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
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
                          {b.paymentMethod === 'bank_transfer' && (() => {
                            const acc = getPaymentAccount(b.paymentAccountId);
                            return (
                              <span className={styles.payAccountLabel} title={acc.description}>
                                {acc.label}
                              </span>
                            );
                          })()}
                          {b.paymentMethod === 'bank_transfer' && (
                            <span className={styles.payRef}>
                              {b.paymentReference ?? `${PAYMENT_CONFIG.paymentReferencePrefix}-${b.ticketCode}`}
                            </span>
                          )}
                          {payStatus === 'awaiting_transfer' && (() => {
                            const h = hoursUntilExpiry(b);
                            if (h === null) return null;
                            return (
                              <span className={h <= 0 ? styles.payExpiredTag : styles.payCountdown}>
                                {h <= 0 ? 'Истекла' : `${h} ч.`}
                              </span>
                            );
                          })()}
                          {bStatus !== 'cancelled' && (
                            <div className={styles.payActions}>
                              {payStatus !== 'paid' && payStatus !== 'expired' && (
                                <button
                                  className={styles.actionPaid}
                                  disabled={isBusy}
                                  onClick={() => setConfirmAction({ type: 'paid', bookingId: b.id })}
                                >Оплачено</button>
                              )}
                              {payStatus === 'paid' && (
                                <button
                                  className={styles.actionUnpaid}
                                  disabled={isBusy}
                                  onClick={() => setConfirmAction({ type: 'unpaid', bookingId: b.id })}
                                >Не оплачено</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={styles.cellMono}>
                          {b.ticketCode || '—'}
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
                                onClick={() => setConfirmAction({ type: 'cancel', bookingId: b.id })}
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

      {tab === 'users' && (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryNum}>{users.length}</span>
              <span className={styles.summaryLabel}>{t.admin.usersCount}</span>
            </div>
          </div>

          {deleteUserError && (
            <div className={styles.deleteUserError}>
              <strong>Ошибка удаления:</strong> {deleteUserError}
              {deleteUserError.includes('FIREBASE_SERVICE_ACCOUNT') && (
                <span> — добавьте переменную <code>FIREBASE_SERVICE_ACCOUNT</code> в настройках Vercel.</span>
              )}
              <button className={styles.errorDismiss} onClick={() => setDeleteUserError(null)}>×</button>
            </div>
          )}

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
                    <th>Действия</th>
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
                      <td>
                        {u.role !== 'admin' && u.uid !== user?.uid && (
                          <button
                            className={styles.actionCancel}
                            disabled={updatingUserId === u.uid}
                            onClick={() => setConfirmAction({
                              type: 'deleteUser',
                              uid: u.uid,
                              displayName: u.displayName || u.email,
                            })}
                          >
                            {updatingUserId === u.uid ? '…' : 'Удалить'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'newsletter' && (
        <div className={styles.newsletterWrap}>
          <h2 className={styles.newsletterTitle}>Рассылка нового спектакля</h2>
          <p className={styles.newsletterHint}>
            Письмо уйдёт только пользователям с включёнными уведомлениями.
            Рассылка запускается вручную — автоматически ничего не отправляется.
          </p>

          <div className={styles.newsletterWarning}>
            На бесплатном тарифе Resend не запускать рассылку несколько раз подряд, потому что упремся в лимиты!!!
          </div>

          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="nl-show">Выбрать спектакль</label>
            <select
              id="nl-show"
              className={styles.select}
              value={nlShowId}
              onChange={e => { setNlShowId(e.target.value); setNlResult(null); }}
              disabled={nlSending}
            >
              {SHOWS.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          <button
            className={styles.actionConfirm}
            onClick={handleNewsletter}
            disabled={nlSending}
          >
            {nlSending ? 'Отправляется…' : 'Отправить рассылку'}
          </button>

          {nlResult && (
            <div className={styles.newsletterResult}>
              <p>Отправлено успешно: <strong>{nlResult.sent}</strong></p>
              {nlResult.errors.length > 0 && (
                <>
                  <p>Ошибки ({nlResult.errors.length}):</p>
                  <ul>
                    {nlResult.errors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </>
              )}
              {nlResult.sent === 0 && nlResult.errors.length === 0 && (
                <p>Нет подписчиков с включёнными уведомлениями.</p>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmAction?.type === 'paid'}
        title="Подтвердить оплату?"
        message="Вы уверены, что хотите отметить эту бронь как оплаченную? Это изменит статус оплаты."
        confirmLabel="Да, оплату получили"
        cancelLabel="Отмена"
        loading={confirmAction?.type === 'paid' && updatingId === confirmAction.bookingId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction || confirmAction.type !== 'paid') return;
          const id = confirmAction.bookingId;
          setConfirmAction(null);
          handlePaymentStatus(id, 'paid');
        }}
      />

      <ConfirmDialog
        isOpen={confirmAction?.type === 'unpaid'}
        title="Снять оплату?"
        message="Вы уверены, что хотите снова отметить эту бронь как неоплаченную? Это действие может сделать билет недействительным."
        confirmLabel="Да, снять оплату"
        cancelLabel="Отмена"
        loading={confirmAction?.type === 'unpaid' && updatingId === confirmAction.bookingId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction || confirmAction.type !== 'unpaid') return;
          const id = confirmAction.bookingId;
          setConfirmAction(null);
          handlePaymentStatus(id, 'not_paid');
        }}
      />

      <ConfirmDialog
        isOpen={confirmAction?.type === 'cancel'}
        title="Отменить бронь?"
        message="Вы уверены, что хотите отменить эту бронь? Билет станет недействительным."
        confirmLabel="Да, отменить бронь"
        cancelLabel="Назад"
        loading={confirmAction?.type === 'cancel' && updatingId === confirmAction.bookingId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction || confirmAction.type !== 'cancel') return;
          const id = confirmAction.bookingId;
          setConfirmAction(null);
          handleStatus(id, 'cancelled');
        }}
      />

      <ConfirmDialog
        isOpen={confirmAction?.type === 'deleteUser'}
        title="Удалить пользователя полностью?"
        message={
          confirmAction?.type === 'deleteUser'
            ? `Пользователь «${confirmAction.displayName}» будет удалён из Firebase Auth, коллекции users и все его бронирования будут удалены. Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Да, удалить полностью"
        cancelLabel="Отмена"
        loading={confirmAction?.type === 'deleteUser' && updatingUserId === confirmAction.uid}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction || confirmAction.type !== 'deleteUser') return;
          const uid = confirmAction.uid;
          setConfirmAction(null);
          void handleDeleteUser(uid);
        }}
      />

    </div>
  );
}
