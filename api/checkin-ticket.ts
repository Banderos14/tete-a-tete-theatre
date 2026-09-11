// Vercel Serverless Function — POST /api/checkin-ticket.
//
// Проверка билета и отметка прохода. Раньше это делалось прямым updateDoc из
// браузера без транзакции: два администратора, сканирующие один код
// одновременно, оба получали успешный проход.
//
// Бизнес-логика — в server/checkin/checkin.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireAdmin } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { checkinTicket } from '../server/checkin/checkin.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  try {
    const admin = await requireAdmin(req);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      respond(res, 400, { error: 'Invalid JSON body' }, req);
      return;
    }

    const result = await checkinTicket({
      adminUid:   admin.uid,
      ticketCode: body.ticketCode,
      action:     body.action,
    });

    respond(res, 200, result, req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Check-in failed');
    if (status >= 500) console.error('[checkin-ticket]', err);
    respond(res, status, payload, req);
  }
}
