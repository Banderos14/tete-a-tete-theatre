import type { Timestamp } from 'firebase/firestore';
import type { TicketTypeId } from '../../shared/catalog/shows';

export type { TicketTypeId } from '../../shared/catalog/shows';

export type BookingStatus  = 'pending' | 'confirmed' | 'cancelled' | 'attended';
export type PaymentMethod  = 'on_site' | 'bank_transfer';
export type PaymentStatus  = 'not_paid' | 'paid' | 'awaiting_transfer' | 'expired';

export interface Booking {
  id: string;
  showId:              string;
  showTitle:           string;
  showDate:            string;
  showTime:            string;
  // Абсолютный момент начала спектакля. Пишется сервером при создании брони;
  // у старых броней отсутствует — тогда время восстанавливается из showDate/showTime
  // как настенное Europe/Paris (см. attendanceService.bookingStartUtcMs).
  showStartAt?:        Timestamp;
  userId:              string;
  userName:            string;
  userEmail:           string;
  userPhone:           string;
  ticketsCount:        number;
  /** Фактически занятые места; отличается от ticketsCount у семейного пакета. */
  seatsCount?:         number;
  ticketType:          TicketTypeId;
  priceInfo:           string;
  totalAmount:         number;
  ticketCode:          string;
  status:              BookingStatus;
  paymentMethod:       PaymentMethod;
  paymentStatus:       PaymentStatus;
  comment:             string;
  lang?:               'RU' | 'FR';
  paymentAccountId?:   string;
  paymentReference?:   string;
  paymentExpiresAt?:   Timestamp;
  paidAt?:             Timestamp;
  /** uid администратора, отметившего оплату (админка и оплата на входе). */
  paidBy?:             string;
  /** Момент прохода в зал — ставит только check-in (server/checkin). */
  attendedAt?:         Timestamp;
  createdAt:           Timestamp;
  updatedAt?:          Timestamp;
  originalAmount?:                  number;
  loyaltyDiscountApplied?:          boolean;
  loyaltyDiscountAmount?:           number;
  loyaltyRewardUsedFromVisitCount?: number;
  cancelledBy?:   'user' | 'admin';
  cancelledByUid?: string;
  /**
   * Письма по брони (пишет сервер): booking — билет после брони, paid — после
   * оплаты, resend — повторная отправка, cancelled — отмена администратором.
   */
  emails?: Partial<Record<'booking' | 'paid' | 'resend' | 'cancelled', {
    status: 'sending' | 'sent' | 'failed' | 'skipped';
    atMs:   number;
    withQr?: boolean;
    reason?: string;
  }>>;
  cancelReason?:  string;
  cancelComment?: string;
  cancelledAt?:   import('firebase/firestore').Timestamp;
}
