// Раздел «Мои билеты»: активные брони. С QR — TicketCard, без QR — BookingCard.

import type { T } from '../../../i18n/translations';
import type { Booking } from '../../../types/booking';
import { TicketCard } from '../TicketCard';
import { BookingCard } from './BookingCard';
import { isScannableTicket } from '../../../../shared/domain/bookingRules';
import styles from './ProfileDrawer.module.scss';

/**
 * Билет-карточка — для оплаченной брони и «оплаты на месте». Бронь с ещё не
 * полученным переводом рисует BookingCard: там реквизиты, срок и отмена, а QR
 * — тот же TicketQrPanel. Билет с QR есть у ЛЮБОЙ действующей брони; правило
 * общее с письмом (shared/domain/bookingRules).
 */
function hasScannableTicket(b: Booking): boolean {
  return isScannableTicket(b) && !!b.ticketCode && b.paymentStatus !== 'awaiting_transfer';
}

export function TicketsSection({
  bookings, activeBookings, loading, error, t,
  expandedTicketId, onToggleTicket,
  dismissingIds, onStartDismiss, onCancelDismiss,
}: {
  bookings: Booking[];
  activeBookings: Booking[];
  loading: boolean;
  error: string | null;
  t: T;
  expandedTicketId: string | null;
  onToggleTicket: (id: string) => void;
  dismissingIds: Set<string>;
  onStartDismiss: (id: string) => void;
  onCancelDismiss: (id: string) => void;
}) {
  // Активные брони плюс те, что уже отменены в Firestore, но доигрывают анимацию ухода.
  const visible = [
    ...activeBookings,
    ...bookings.filter(b => dismissingIds.has(b.id) && !activeBookings.some(a => a.id === b.id)),
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.ticketsTitle}>{t.profile.history}</h2>
      {loading ? (
        <div className={styles.skeletonList}>
          {[1, 2].map(i => <div key={i} className={`${styles.skeleton} ${styles.skeletonTicket}`} />)}
        </div>
      ) : error ? (
        <p className={styles.historyError}>{error}</p>
      ) : activeBookings.length === 0 && dismissingIds.size === 0 ? (
        <p className={styles.emptyText}>{t.profile.noHistory}</p>
      ) : (
        <div className={styles.ticketList}>
          {visible.map(b => {
            const isDismissing = dismissingIds.has(b.id);
            return (
              <div key={b.id} className={isDismissing ? styles.ticketItemDismissing : undefined}>
                {hasScannableTicket(b) ? (
                  <TicketCard
                    booking={b}
                    isExpanded={expandedTicketId === b.id}
                    onToggle={() => onToggleTicket(b.id)}
                  />
                ) : (
                  <BookingCard
                    booking={b}
                    t={t}
                    isDismissing={isDismissing}
                    onStartDismiss={onStartDismiss}
                    onCancelDismiss={onCancelDismiss}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
