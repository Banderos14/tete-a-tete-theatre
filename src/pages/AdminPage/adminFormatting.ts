// Форматирование значений в таблицах админки. Без React и без стилей —
// поэтому проверяется юнит-тестом.

import type { PaymentStatus } from '../../types/booking';
import type { AdminUser } from '../../services/userService';

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
