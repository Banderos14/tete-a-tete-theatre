// Vercel Cron — GET /api/expire-bookings.
//
// Вызывается по расписанию из vercel.json (раз в сутки: чаще Hobby-план
// Vercel не разрешает). Vercel присылает Authorization: Bearer <CRON_SECRET>.
//
// Доступ закрыт по умолчанию: без CRON_SECRET на сервере задача не выполняется
// вовсе. Раньше проверка была `if (secret && ...)`, и незаданная переменная
// открывала endpoint кому угодно.
//
// Бизнес-логика — в server/expiration/expiration.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond } from '../server/shared/http.js';
import { requireCronSecret } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { expireOverdueTransfers } from '../server/expiration/expiration.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' }, req);
    return;
  }

  try {
    // Строго до любой бизнес-логики: ни одна бронь не должна быть затронута,
    // пока вызывающий не подтверждён.
    requireCronSecret(req);

    const { expired, shows } = await expireOverdueTransfers();
    console.log(`[expire-bookings] expired=${expired} shows=${shows.length}`);
    respond(res, 200, { ok: true, expired, shows }, req);
  } catch (err) {
    // Наружу — нейтральный текст: подробности остаются в серверном логе.
    const { status, body } = errorResponse(err, 'Failed to expire bookings');
    if (status >= 500) console.error('[expire-bookings]', err);
    respond(res, status, body, req);
  }
}
