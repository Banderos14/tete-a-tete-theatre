// Разбор и проверка полей письма.
//
// HTML и subject строит клиент (шаблоны живут во фронтенде), поэтому здесь
// валидируются только форма и размеры. Кому и что можно отправлять — решает
// email.service.

import { badRequest } from '../shared/errors.js';
import { ALLOWED_EMAIL_TYPES, type EmailType, type SendEmailRequest } from './email.types.js';

export const MAX_SUBJECT_LEN = 500;
export const MAX_HTML_LEN    = 120_000; // ~120 КБ — заметно больше любого нормального письма

function isValidEmail(value: string): boolean {
  // Минимальная проверка формы — её достаточно для пользовательского ввода.
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/** Проверяет тип письма отдельно: от него зависит требуемая авторизация. */
export function validateEmailType(raw: unknown): EmailType {
  if (!raw || !(ALLOWED_EMAIL_TYPES as readonly string[]).includes(String(raw))) {
    throw badRequest('Missing or invalid type');
  }
  return String(raw) as EmailType;
}

export function validateEmailPayload(type: EmailType, body: Record<string, unknown>): SendEmailRequest {
  const { to, subject, html, text, ticketCode } = body;

  if (!isValidEmail(String(to ?? ''))) {
    throw badRequest('Missing or invalid recipient email');
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > MAX_SUBJECT_LEN) {
    throw badRequest('Missing or invalid subject');
  }
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_HTML_LEN) {
    throw badRequest('Missing or invalid html body');
  }

  return {
    type,
    to:      String(to),
    subject: subject.trim(),
    html,
    ...(typeof text === 'string' && text.trim() ? { text: text.trim() } : {}),
    ...(typeof ticketCode === 'string' ? { ticketCode: ticketCode.trim() } : {}),
  };
}
