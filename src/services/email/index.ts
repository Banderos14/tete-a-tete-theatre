// Публичный вход почтового слоя frontend'а.
//
// Отправка идёт в Vercel Serverless Function /api/send-email — ключ Resend
// во frontend не попадает. Письма брони отправляются best-effort: сбой почты
// не должен блокировать бронирование.

export type { BookingEmailData, BookingStatusEmailData, PaymentPaidEmailData, NewShowEmailData } from './types';
export { escapeEmailHtml } from './layout';
export { buildNewShowEmail } from './templates/newShow';
export {
  sendBookingConfirmationEmail,
  sendBookingStatusUpdateEmail,
  sendPaymentPaidEmail,
} from './send';
