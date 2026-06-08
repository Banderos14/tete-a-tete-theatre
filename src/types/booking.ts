import type { Timestamp } from 'firebase/firestore';

export type BookingStatus  = 'pending' | 'confirmed' | 'cancelled' | 'attended';
export type PaymentMethod  = 'on_site' | 'bank_transfer';
export type PaymentStatus  = 'not_paid' | 'paid' | 'awaiting_transfer';
export type TicketTypeId   = 'standard' | 'student';

export interface Booking {
  id: string;
  showId:        string;
  showTitle:     string;
  showDate:      string;
  showTime:      string;
  userId:        string;
  userName:      string;
  userEmail:     string;
  userPhone:     string;
  ticketsCount:  number;
  ticketType:    TicketTypeId;
  priceInfo:     string;
  totalAmount:   number;
  ticketCode:    string;
  status:        BookingStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  comment:       string;
  lang?:         'RU' | 'FR';
  createdAt:     Timestamp;
  updatedAt?:    Timestamp;
}

export type NewBooking = Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>;
