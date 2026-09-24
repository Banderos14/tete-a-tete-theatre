// Кому на самом деле уходит письмо — одна точка на все исходящие письма.
//
// Production: письмо получает тот, кому оно адресовано.
//
// Всё остальное (staging, preview, `vercel dev`): письмо НИКОГДА не уходит
// реальному зрителю. Оно перенаправляется на TEST_EMAIL_RECIPIENT, а исходный
// адресат виден в теме и в начале письма — так можно проверить весь поток,
// не рискуя написать клиенту. Нет TEST_EMAIL_RECIPIENT — письмо не
// отправляется вовсе (fail closed).
//
// Признак production — isProductionRuntime() (VERCEL_ENV), см. server/shared/runtimeEnv.ts.

import { isProductionRuntime, runtimeLabel } from '../shared/runtimeEnv.js';

export interface OutgoingEmail {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

export type RoutedEmail =
  | { kind: 'send'; email: OutgoingEmail; redirectedFrom?: string }
  | { kind: 'blocked'; reason: 'staging_no_test_recipient' };

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Тестовый адрес staging или null, если он не задан или не похож на адрес. */
export function testRecipient(): string | null {
  const value = (process.env.TEST_EMAIL_RECIPIENT ?? '').trim();
  return EMAIL_RE.test(value) ? value : null;
}

export function routeEmail(email: OutgoingEmail): RoutedEmail {
  if (isProductionRuntime()) return { kind: 'send', email };

  const target = testRecipient();
  if (!target) return { kind: 'blocked', reason: 'staging_no_test_recipient' };

  const label    = runtimeLabel();
  const original = email.to;
  const banner   =
    `<div style="background:#fff3cd;border:1px solid #e0c36b;color:#5c4400;padding:10px 14px;` +
    `margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;">` +
    `<strong>${escapeHtml(label)}</strong> — тестовое письмо. Предполагаемый получатель: ` +
    `<strong>${escapeHtml(original)}</strong>. Реальному зрителю это письмо не отправлялось.</div>`;

  return {
    kind: 'send',
    redirectedFrom: original,
    email: {
      to:      target,
      subject: `[${label} → ${original}] ${email.subject}`,
      html:    email.html.includes('<body')
        ? email.html.replace(/<body([^>]*)>/i, `<body$1>${banner}`)
        : `${banner}${email.html}`,
      ...(email.text !== undefined
        ? { text: `[${label}] Предполагаемый получатель: ${original}\n\n${email.text}` }
        : {}),
    },
  };
}
