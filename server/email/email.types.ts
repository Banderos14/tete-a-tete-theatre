// Типы почтового слоя.

/** Whitelist типов писем, которые клиенту разрешено запрашивать. */
export const ALLOWED_EMAIL_TYPES = [
  'booking-confirmation',
  'booking-status',
  'payment-paid',
  'newsletter',
] as const;

export type EmailType = (typeof ALLOWED_EMAIL_TYPES)[number];

/** Типы, отправлять которые может только администратор. */
export const ADMIN_ONLY_TYPES: readonly EmailType[] = ['newsletter', 'booking-status', 'payment-paid'];

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
