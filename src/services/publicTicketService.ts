// Статус билета для публичной страницы /#/ticket — без входа и без Firebase.
//
// Модуль не импортирует Firebase: страница открывается из письма в
// чужом браузере, где сессии нет, и SDK ей не нужен. Токен не отправляется —
// endpoint публичный и отдаёт только то, что напечатано на билете.

import type { PublicTicket, PublicTicketResponse } from '../../shared/contracts/ticket';

export type PublicTicketLookup =
  | { kind: 'ok'; ticket: PublicTicket }
  | { kind: 'not_found' }
  | { kind: 'invalid' }
  // Сеть, лимит запросов, сбой сервера или локальный `npm run dev` без /api/*.
  | { kind: 'unavailable' };

export async function fetchPublicTicket(code: string): Promise<PublicTicketLookup> {
  try {
    const resp = await fetch(`/api/public-ticket?code=${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
      cache:   'no-store',
    });
    const data = await resp.json().catch(() => ({})) as Partial<PublicTicketResponse> & { reason?: string };
    // «Не найден» — только ответ самого endpoint'а; голый 404 (нет /api/*) — это сбой.
    if (resp.status === 404 && data.reason === 'not_found') return { kind: 'not_found' };
    if (resp.status === 400 && data.reason === 'invalid_code') return { kind: 'invalid' };
    return resp.ok && data.ticket ? { kind: 'ok', ticket: data.ticket } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
