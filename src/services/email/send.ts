// Отправка писем. Шаблон собирается локально, наружу уходит уже готовый HTML.

import { callEndpoint } from './transport';
import { buildConfirmationEmail } from './templates/confirmation';
import { buildStatusEmail } from './templates/status';
import { buildPaymentPaidEmail } from './templates/paymentPaid';
import { buildNewShowEmail } from './templates/newShow';
import type { BookingEmailData, BookingStatusEmailData, PaymentPaidEmailData, NewShowEmailData } from './types';

// Письма брони отправляются best-effort: бронирование не должно блокироваться
// или считаться неуспешным из-за сбоя почты, поэтому наружу остаётся Promise<void>.
// authToken — Firebase ID token текущего пользователя; сервер проверяет, что
// recipient совпадает с email авторизованного пользователя (защита от open-relay).
export async function sendBookingConfirmationEmail(data: BookingEmailData, authToken?: string): Promise<void> {
  if (!data.userEmail) {
    console.warn('[emailService] sendBookingConfirmationEmail: no recipient email, skipping');
    return;
  }
  const { subject, html, text } = buildConfirmationEmail(data);
  // ticketCode обязателен: сервер проверяет, что письмо относится к реальной
  // брони этого пользователя, иначе endpoint был бы генератором произвольных писем.
  await callEndpoint(
    { type: 'booking-confirmation', to: data.userEmail, subject, html, text, ticketCode: data.ticketCode },
    authToken,
  );
}

// Обновление статуса брони (confirmed / cancelled / attended) — отправляется из AdminPage.
// authToken — Firebase ID token admin-пользователя; сервер проверяет роль.
export async function sendBookingStatusUpdateEmail(data: BookingStatusEmailData, authToken?: string): Promise<void> {
  const { subject, html, text } = buildStatusEmail(data);
  await callEndpoint({ type: 'booking-status', to: data.userEmail, subject, html, text }, authToken);
}

// Подтверждение оплаты — отправляется когда admin отмечает бронь как оплаченную.
// authToken — Firebase ID token admin-пользователя; сервер проверяет роль.
export async function sendPaymentPaidEmail(data: PaymentPaidEmailData, authToken?: string): Promise<void> {
  if (!data.userEmail) return;
  const { subject, html, text } = buildPaymentPaidEmail(data);
  await callEndpoint({ type: 'payment-paid', to: data.userEmail, subject, html, text }, authToken);
}

// Анонс нового спектакля — отправлять по одному получателю;
// AdminPage перебирает список через getUsersForNewsletter().
// В отличие от писем брони, рассылка должна честно сообщать админу об успехе/отказе,
// поэтому возвращаем boolean по реальному ответу API, а не глотаем ошибку.
//
// authToken — Firebase ID token текущего admin-пользователя.
// Сервер проверяет его и отклоняет запрос если роль не 'admin'.
export async function sendNewShowAnnouncementEmail(data: NewShowEmailData, authToken?: string): Promise<boolean> {
  if (!data.userEmail) return false;
  const { subject, html, text } = buildNewShowEmail(data);
  return callEndpoint({ type: 'newsletter', to: data.userEmail, subject, html, text }, authToken);
}
