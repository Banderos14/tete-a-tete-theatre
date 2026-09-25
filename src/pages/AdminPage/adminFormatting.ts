// Форматирование значений в таблицах админки. Без React и без стилей —
// поэтому проверяется юнит-тестом.

import type { Booking, PaymentMethod, PaymentStatus } from '../../types/booking';
import type { AdminUser } from '../../services/userService';
import { onlineBookingState } from '../../utils/onlinePayment';
import { financialHold, type FinancialHold } from '../../../shared/domain/bookingRules';

/** Firestore Timestamp (или его сырой вид) → дата-время для таблицы. */
export function formatTimestamp(ts: unknown): string {
  if (!ts) return '—';
  try {
    const t = ts as { toDate?: () => Date; seconds?: number };
    const date = t.toDate ? t.toDate() : new Date((t.seconds ?? 0) * 1000);
    return date.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const MESSENGER_LABELS: Record<string, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram' };

export const PROVIDER_LABELS: Record<string, string> = { email: 'Email', google: 'Google', facebook: 'Facebook' };

/** Предпочитаемые мессенджеры пользователя одной строкой. */
export function contactLabel(u: AdminUser): string {
  const contacts = u.preferredContact ?? [];
  return contacts.map(m => MESSENGER_LABELS[m] ?? m).join(' / ');
}

/** ISO-дата рождения → ДД.ММ.ГГГГ; мусор отдаётся как есть. */
export function formatBirthday(b?: string): string | null {
  if (!b) return null;
  const [y, m, d] = b.split('-');
  return (y && m && d) ? `${d}.${m}.${y}` : b;
}

export const PAY_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_paid:          'Не оплачено',
  awaiting_transfer: 'Ожидает перевода',
  awaiting_online:   'Ожидает онлайн-оплаты',
  paid:              'Оплачено',
  expired:           'Истекло',
  refunded:          'Возвращено',
};

// ── Способ и состояние оплаты ───────────────────────────────────────────────

/** Способ оплаты по-человечески. Онлайн помечен Stripe — источник подтверждения. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  on_site:       'На месте',
  bank_transfer: 'Перевод',
  online:        'Онлайн · Stripe',
};

export function paymentMethodLabel(method: string | undefined): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? PAYMENT_METHOD_LABELS.on_site;
}

export type AdminPayTone = 'paid' | 'awaiting' | 'notPaid' | 'expired' | 'issue';

/**
 * Статус оплаты для таблицы. Для онлайн-оплаты — состояние, которое записали
 * webhook и сверка Stripe (onlineBookingState), без технических enum'ов.
 */
export function adminPaymentState(b: Pick<Booking, 'paymentMethod' | 'paymentStatus' | 'status' | 'refund' | 'paymentIssue'>): { label: string; tone: AdminPayTone } {
  const pay = b.paymentStatus ?? 'not_paid';
  if (b.paymentMethod === 'online') {
    switch (onlineBookingState(b)) {
      case 'awaiting':       return { label: 'Ожидает онлайн-оплаты', tone: 'awaiting' };
      case 'paid':           return { label: 'Оплачено онлайн',       tone: 'paid' };
      case 'refund_pending': return { label: 'Возврат обрабатывается', tone: 'awaiting' };
      case 'refunded':       return { label: 'Возвращено',            tone: 'expired' };
      case 'issue':
        return b.refund?.status === 'failed' || b.paymentIssue === 'refund_failed'
          ? { label: 'Возврат не выполнен', tone: 'issue' }
          : { label: 'Требуется проверка',  tone: 'issue' };
      case 'expired':        return { label: 'Время оплаты истекло',  tone: 'expired' };
      default:               break;
    }
  }
  const tone: AdminPayTone = pay === 'paid' ? 'paid'
    : pay === 'awaiting_transfer' || pay === 'awaiting_online' ? 'awaiting'
    : pay === 'expired' || pay === 'refunded' ? 'expired'
    : 'notPaid';
  return { label: PAY_STATUS_LABELS[pay] ?? PAY_STATUS_LABELS.not_paid, tone };
}

/** Проблема оплаты — безопасное объяснение для администратора, без данных Stripe. */
export const PAYMENT_ISSUE_TEXT: Record<string, string> = {
  paid_after_cancel: 'Оплата пришла после отмены или истечения брони. Место не вернулось автоматически. Верните деньги в Stripe или свяжитесь со зрителем.',
  amount_mismatch:   'Сумма или валюта оплаты в Stripe не совпала с бронью — бронь не отмечена оплаченной. Сверьте платёж в Stripe.',
  partial_refund:    'В Stripe сделан частичный возврат. Бронь действует — проверьте, так ли задумано.',
  refund_failed:     'Возврат в Stripe не выполнен — деньги остались у театра. Бронь не восстановлена автоматически: проверьте платёж в Stripe и решите вручную.',
};

export function paymentIssueText(issue: string | undefined | null): string | null {
  if (!issue) return null;
  return PAYMENT_ISSUE_TEXT[issue] ?? 'Оплата требует проверки в Stripe.';
}

/** Почему отменённую бронь нельзя удалить (то же правило проверяет сервер). */
export const FINANCIAL_HOLD_TEXT: Record<FinancialHold, string> = {
  refund_pending: 'возврат ещё обрабатывается',
  refund_failed:  'возврат не выполнен',
  payment_issue:  'оплата требует проверки',
  paid_online:    'онлайн-оплата не возвращена',
};

export function deletionBlockedReason(b: Parameters<typeof financialHold>[0]): string | null {
  const hold = financialHold(b);
  return hold ? FINANCIAL_HOLD_TEXT[hold] : null;
}

// ── Письмо-билет ────────────────────────────────────────────────────────────

const TICKET_EMAIL_STATE: Record<string, string> = {
  sent: 'Билет отправлен', failed: 'Билет НЕ ушёл', skipped: 'Билет не отправлялся', sending: 'Билет отправляется',
};

/**
 * Последнее письмо-билет по брони одной строкой под кнопкой «Отправить билет»:
 * «Билет отправлен: 24.09.2026, 22:18». Письмо об отмене не считается.
 * null — писем-билетов не было.
 */
export function ticketEmailLine(emails: Booking['emails'] | undefined): string | null {
  const entries = Object.entries(emails ?? {}).filter(([k, v]) => k !== 'cancelled' && v);
  if (entries.length === 0) return null;
  const [, last] = entries.sort(([, x], [, y]) => (y?.atMs ?? 0) - (x?.atMs ?? 0))[0]!;
  if (!last) return null;
  const label = TICKET_EMAIL_STATE[last.status] ?? 'Билет';
  return `${label}: ${formatTimestamp({ seconds: last.atMs / 1000 })}`;
}
