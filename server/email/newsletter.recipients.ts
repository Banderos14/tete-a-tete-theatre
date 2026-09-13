// Получатели рассылки. Список собирает только сервер: адреса подписчиков
// в браузер администратора не уходят, наружу отдаётся лишь их количество.

import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import type { NewsletterLang } from '../../shared/contracts/newsletter.js';

export interface NewsletterRecipient {
  uid:   string;
  email: string;
  name:  string;
  lang:  NewsletterLang;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LEN = 254;
const MAX_NAME_LEN  = 100;

export function isValidRecipientEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LEN && EMAIL_RE.test(value);
}

/**
 * Кому уходит анонс: включённые уведомления, валидный e-mail, не администратор.
 * Один адрес получает одно письмо, даже если он записан в нескольких профилях:
 * иначе человек получил бы дубль, а квота Resend ушла бы впустую.
 */
export function selectNewsletterRecipients(
  users: readonly { uid: string; data: Record<string, unknown> }[],
): NewsletterRecipient[] {
  const seen = new Set<string>();
  const out: NewsletterRecipient[] = [];

  for (const { uid, data } of users) {
    if (data.notifications !== true || data.role === 'admin') continue;
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (!isValidRecipientEmail(email)) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
    out.push({
      uid,
      email,
      name: (displayName || email).slice(0, MAX_NAME_LEN),
      lang: data.language === 'fr' ? 'FR' : 'RU',
    });
  }
  return out;
}

export async function loadNewsletterRecipients(): Promise<NewsletterRecipient[]> {
  const snap = await getFirestore(getAdminApp()).collection('users').get();
  return selectNewsletterRecipients(snap.docs.map(d => ({ uid: d.id, data: d.data() })));
}
