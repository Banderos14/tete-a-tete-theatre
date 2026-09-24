import type { Timestamp } from 'firebase/firestore';
import type { TicketTypeId } from '../../shared/catalog/shows';

export type { TicketTypeId } from '../../shared/catalog/shows';

export type BookingStatus  = 'pending' | 'confirmed' | 'cancelled' | 'attended';
export type PaymentMethod  = 'on_site' | 'bank_transfer' | 'online';
export type PaymentStatus  = 'not_paid' | 'paid' | 'awaiting_transfer' | 'awaiting_online' | 'expired' | 'refunded';

/** Возврат онлайн-оплаты — синхронизируется из Stripe webhook (refund.created/updated). */
export interface BookingRefund {
  id:        string;
  status:    'pending' | 'succeeded' | 'failed';
  /** Сумма возврата в евро. */
  amount:    number;
  updatedAtMs: number;
}

/** Деньги пришли, но принять их автоматически нельзя — показать администратору. */
export type PaymentIssue = 'amount_mismatch' | 'paid_after_cancel' | 'partial_refund';

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
  // ── Онлайн-оплата (Stripe Hosted Checkout). Пишет только сервер. ──
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?:   string;
  refund?:                  BookingRefund;
  refundedAt?:              Timestamp;
  paymentIssue?:            PaymentIssue;
  paymentIssueDetails?:     Record<string, unknown>;
  cancelledAt?:   import('firebase/firestore').Timestamp;
}
