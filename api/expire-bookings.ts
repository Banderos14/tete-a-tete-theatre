// Vercel Cron — GET /api/expire-bookings.
//
// Вызывается по расписанию из vercel.json. Доступ: Vercel сам присылает
// Authorization: Bearer <CRON_SECRET>. Если переменная задана, запрос без неё
// отклоняется — endpoint не должен дёргаться посторонними.
//
// Бизнес-логика — в server/expiration/expiration.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, bearerToken } from '../server/shared/http.js';
import { expireOverdueTransfers } from '../server/expiration/expiration.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' }, req);
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (secret && bearerToken(req) !== secret) {
    respond(res, 401, { error: 'Unauthorized' }, req);
    return;
  }

  try {
    const { expired, shows } = await expireOverdueTransfers();
    console.log(`[expire-bookings] expired=${expired} shows=${shows.length}`);
    respond(res, 200, { ok: true, expired, shows }, req);
  } catch (err) {
    console.error('[expire-bookings] failed:', err);
    respond(res, 500, { error: 'Failed to expire bookings' }, req);
  }
}
