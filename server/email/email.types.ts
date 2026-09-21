// Типы почтового слоя.

/** Письма о брони и билете — их отправляет только сервер (ticketEmail.service). */
export type TicketEmailType = 'ticket-booking' | 'ticket-paid' | 'ticket-resend' | 'booking-cancelled';

/** Всё, что попадает в журнал emailLog, включая рассылку. */
export type LoggedEmailType = TicketEmailType | 'newsletter';

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';
