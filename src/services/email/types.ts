// Данные писем. Формируются на клиенте, отправляются через /api/send-email.

import type { BookingStatus } from '../../types/booking';

export interface BookingEmailData {
  userEmail:        string;
  userName:         string;
  showTitle:        string;
  showTitleFR?:     string;
  showDate:         string;
  showTime:         string;
  ticketsCount:     number;
  ticketType:       string;
  totalAmount:      number;
  ticketCode:       string;
  paymentMethod:    'on_site' | 'bank_transfer';
  paymentAccountId?: string;
  lang:             'RU' | 'FR';
  originalAmount?:        number;
  loyaltyDiscountApplied?: boolean;
  loyaltyDiscountAmount?: number;
}

export interface BookingStatusEmailData {
  userEmail:    string;
  userName:     string;
  showTitle:    string;
  showDate:     string;
  showTime:     string;
  ticketsCount: number;
  totalAmount:  number;
  ticketCode:   string;
  newStatus:    Extract<BookingStatus, 'confirmed' | 'cancelled' | 'attended'>;
  lang:         'RU' | 'FR';
}

export interface PaymentPaidEmailData {
  userEmail:     string;
  userName:      string;
  showTitle:     string;
  showDate:      string;
  showTime:      string;
  ticketsCount:  number;
  totalAmount:   number;
  ticketCode:    string;
  bookingStatus: BookingStatus;
  lang:          'RU' | 'FR';
}

export interface NewShowEmailData {
  userEmail:   string;
  userName:    string;
  showTitle:   string;
  showDate:    string;
  showTime:    string;
  price?:      string;
  description?: string;
  showUrl:     string;
  lang:        'RU' | 'FR';
}
