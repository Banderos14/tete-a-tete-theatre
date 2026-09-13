// Отправка писем через Resend.
//
// Модель безопасности:
//   - анонимных отправок не бывает: любой тип требует Firebase ID token
//   - booking-status / payment-paid — только администратор
//   - рассылки здесь нет: она идёт через /api/newsletter с проверкой квоты
//   - booking-confirmation — получатель обязан совпадать с e-mail вызывающего
//     И письмо должно относиться к его реальной брони (иначе endpoint был бы
//     генератором произвольных писем от имени театра)
//   - лимит отправки считается по ВЫЗЫВАЮЩЕМУ: цель — не дать выжечь квоту
//     Resend, кем бы получатель ни был

import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import { ApiError, forbidden, badRequest, tooManyRequests } from '../shared/errors.js';
import { callerEmail, isAdminUid } from '../shared/auth.js';
import { consumeRateLimit } from '../shared/rateLimit.js';
import { ADMIN_ONLY_TYPES, type EmailType, type SendEmailRequest, type SendEmailResult } from './email.types.js';
import { ownsBookingWithTicketCode, logEmailDelivery } from './email.repository.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

const HOUR_MS = 60 * 60 * 1000;
// Обычный зритель: подтверждений брони столько не бывает даже в самый активный день.
const USER_EMAIL_LIMIT_PER_HOUR  = 12;
// Администратор: письма о статусе и оплате при массовой обработке броней.
const ADMIN_EMAIL_LIMIT_PER_HOUR = 600;

/** Проверяет право вызывающего отправить письмо данного типа. Бросает 403. */
export async function authorizeEmail(
  type: EmailType, callerUid: string,
): Promise<{ isAdmin: boolean }> {
  const isAdmin = await isAdminUid(callerUid).catch(() => false);

  if (ADMIN_ONLY_TYPES.includes(type) && !isAdmin) {
    throw forbidden(`${type} is admin-only`);
  }
  return { isAdmin };
}

/** Лимит отправки. Сбой самого лимитера письмо о брони не блокирует. */
export async function enforceEmailRateLimit(callerUid: string, isAdmin: boolean): Promise<void> {
  try {
    const limited = await consumeRateLimit(getFirestore(getAdminApp()), {
      bucket:   `${isAdmin ? 'email-admin' : 'email-user'}:${callerUid}`,
      limit:    isAdmin ? ADMIN_EMAIL_LIMIT_PER_HOUR : USER_EMAIL_LIMIT_PER_HOUR,
      windowMs: HOUR_MS,
    });
    if (!limited.allowed) {
      throw tooManyRequests('Too many emails, try again later', {
        retryAfterSeconds: Math.max(1, Math.ceil((limited.resetAtMs - Date.now()) / 1000)),
      });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Сбой лимитера не должен ломать отправку подтверждения брони —
    // но и молча пропускать его нельзя, поэтому пишем в лог.
    console.error('[send-email] rate limit check failed:', err);
  }
}

/** booking-confirmation: получатель == вызывающий И бронь принадлежит ему. */
async function assertOwnConfirmation(request: SendEmailRequest, callerUid: string): Promise<void> {
  const email = await callerEmail(callerUid);
  if (!email || email.toLowerCase() !== request.to.toLowerCase()) {
    throw forbidden('Recipient email must match the authenticated user');
  }
  if (!request.ticketCode) {
    throw badRequest('ticketCode is required for booking-confirmation');
  }
  if (!await ownsBookingWithTicketCode(callerUid, request.ticketCode)) {
    throw forbidden('Booking not found for this user');
  }
}

export async function sendEmail(request: SendEmailRequest, callerUid: string): Promise<SendEmailResult> {
  if (request.type === 'booking-confirmation') {
    await assertOwnConfirmation(request, callerUid);
  }

  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM;

  if (!apiKey || !fromAddr) {
    // Провайдер не настроен — отвечаем успехом, чтобы бронь никогда
    // не блокировалась: она уже сохранена в Firestore.
    console.warn('[send-email] RESEND_API_KEY or EMAIL_FROM not set — email skipped');
    void logEmailDelivery({ type: request.type, uid: callerUid, status: 'skipped' });
    return { ok: true, skipped: true, reason: 'Email provider not configured' };
  }

  console.log('[EMAIL] FROM =', fromAddr, '| type =', request.type);

  const resendRes = await fetch(RESEND_API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    fromAddr,
      to:      request.to,
      subject: request.subject,
      html:    request.html,
      ...(request.text ? { text: request.text } : {}),
    }),
  });

  if (resendRes.ok) {
    void logEmailDelivery({
      type: request.type, uid: callerUid, status: 'sent', providerStatus: resendRes.status,
      ...(request.ticketCode ? { ticketCode: request.ticketCode } : {}),
    });
    return { ok: true };
  }

  // Resend вернул ошибку — подробности в серверный лог, наружу нейтральный текст.
  const errData = await resendRes.json().catch(() => ({})) as Record<string, unknown>;
  console.error('[send-email] Resend responded with error', resendRes.status, errData);
  void logEmailDelivery({
    type: request.type, uid: callerUid, status: 'failed', providerStatus: resendRes.status,
  });
  throw new Error('Email provider error');
}
