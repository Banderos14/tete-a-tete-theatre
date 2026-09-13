// Типы почтового слоя.

/**
 * Whitelist типов писем, которые клиенту разрешено запрашивать через /api/send-email.
 *
 * Рассылки здесь нет: она идёт только через /api/newsletter, где сервер сам
 * выбирает получателей и проверяет дневную квоту Resend перед первым письмом.
 * Поштучная отправка анонса обходила бы эту проверку.
 */
export const ALLOWED_EMAIL_TYPES = [
  'booking-confirmation',
  'booking-status',
  'payment-paid',
] as const;

export type EmailType = (typeof ALLOWED_EMAIL_TYPES)[number];

/** Всё, что попадает в журнал emailLog, включая рассылку. */
export type LoggedEmailType = EmailType | 'newsletter';

/** Типы, отправлять которые может только администратор. */
export const ADMIN_ONLY_TYPES: readonly EmailType[] = ['booking-status', 'payment-paid'];

export interface SendEmailRequest {
  type:        EmailType;
  to:          string;
  subject:     string;
  html:        string;
  text?:       string;
  /** Обязателен для booking-confirmation: письмо привязывается к реальной брони. */
  ticketCode?: string;
}

export interface SendEmailResult {
  ok:       true;
  skipped?: boolean;
  reason?:  string;
}

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';
