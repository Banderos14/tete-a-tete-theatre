// Контракты API бронирования.
//
// Изоморфный модуль: эти типы описывают то, что летает по проводу между
// браузером и /api/*, поэтому импортируются обеими сторонами. Здесь не должно
// появиться ни одной серверной зависимости.

export type TicketTypeId   = 'standard' | 'student' | 'child' | 'adult' | 'family';
export type PaymentMethod  = 'on_site' | 'bank_transfer' | 'online';
export type UiLanguage     = 'RU' | 'FR';

/** Строка корзины в запросе: тариф и количество. Цену берёт сервер из каталога. */
export interface BookingItemRequest {
  ticketType: TicketTypeId;
  quantity:   number;
}

/** Строка состава брони, записанная сервером (bookings/{id}.ticketItems). */
export interface BookingTicketItem {
  type:      TicketTypeId;
  quantity:  number;
  unitPrice: number;
  seats:     number;
  subtotal:  number;
}

/** Тело POST /api/create-booking. Цену и статусы сервер считает сам. */
export interface CreateBookingRequest {
  showId:        string;
  /**
   * Несколько тарифов в одной брони. Если задано — ticketType/ticketsCount
   * сервер не читает; они остаются для совместимости (первый тариф и всего билетов).
   */
  items?:        BookingItemRequest[];
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
  /** Состав брони по тарифам (новые брони). */
  ticketItems?:            BookingTicketItem[];
  ticketsCount?:           number;
  seatsCount?:             number;
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
  /** Письмо-билет: отправлено сервером, не нужно (нет адреса/провайдера) или не ушло. */
  ticketEmail?:            'sent' | 'skipped' | 'failed';
  /**
   * Онлайн-оплата: адрес Stripe Hosted Checkout. Клиент делает на него
   * location.assign. Пришёл — сессия открыта и её id уже записан в бронь.
   */
  checkoutUrl?:            string;
  /** Онлайн-оплата уже подтверждена (повтор запроса после оплаты). */
  checkoutState?:          'open' | 'paid' | 'processing';
}

/** Тело POST /api/create-booking с action 'resume_checkout' — вернуться к оплате своей брони. */
export interface ResumeCheckoutRequest {
  action:    'resume_checkout';
  bookingId: string;
}

export interface ResumeCheckoutResponse {
  ok:               true;
  bookingId:        string;
  checkoutState:    'open' | 'paid' | 'processing';
  checkoutUrl?:     string;
  /** Срок удержания мест (мс UTC) — фактический expires_at сессии Stripe. */
  paymentExpiresAt?: number;
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
  | 'already_attended'
  // Онлайн-оплата: приём выключен на сервере, Stripe недоступен, сессия истекла.
  | 'online_payment_unavailable'
  | 'payment_unavailable'
  | 'checkout_expired'
  | 'checkout_in_progress'
  | 'payment_processing'
  // Оплаченную онлайн бронь нельзя просто отменить: сначала возврат в Stripe.
  | 'refund_required'
  // Оплата онлайн-брони принимается только через Stripe.
  | 'online_payment';
