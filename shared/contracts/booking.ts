// Контракты API бронирования.
//
// Изоморфный модуль: эти типы описывают то, что летает по проводу между
// браузером и /api/*, поэтому импортируются обеими сторонами. Здесь не должно
// появиться ни одной серверной зависимости.

export type TicketTypeId   = 'standard' | 'student';
export type PaymentMethod  = 'on_site' | 'bank_transfer';
export type UiLanguage     = 'RU' | 'FR';

/** Тело POST /api/create-booking. Цену и статусы сервер считает сам. */
export interface CreateBookingRequest {
  showId:        string;
  ticketType:    TicketTypeId;
  ticketsCount:  number;
  paymentMethod: PaymentMethod;
  comment:       string;
  phone:         string;
  lang:          UiLanguage;
}

export interface CreateBookingResponse {
  ok:                      true;
  /** true, если это повтор запроса с тем же Idempotency-Key. */
  replayed?:               boolean;
  bookingId:               string;
  ticketCode:              string;
  totalAmount:             number;
  priceInfo?:              string;
  showDate:                string;
  showTime:                string;
  showTitle:               string;
  showTitleFR?:            string;
  paymentReference?:       string;
  /** Момент истечения срока перевода в мс UTC. */
  paymentExpiresAt?:       number;
  originalAmount?:         number;
  loyaltyDiscountApplied?: boolean;
  loyaltyDiscountAmount?:  number;
}

/** Тело POST /api/cancel-booking. */
export interface CancelBookingRequest {
  bookingId: string;
  reason:    string;
  comment?:  string;
}

/** Ответ GET /api/show-availability — только числа, без персональных данных. */
export interface ShowAvailability {
  capacity:  number;
  sold:      number;
  remaining: number;
}

export interface ShowAvailabilityResponse {
  ok:    true;
  shows: Record<string, ShowAvailability>;
}

/** Машиночитаемые причины отказа, на которые опирается интерфейс. */
export type BookingRefusalReason =
  | 'capacity_exceeded'
  | 'show_started'
  | 'already_paid'
  | 'already_cancelled'
  | 'already_attended';
