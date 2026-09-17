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
import { groupCheckin, inspectGroup } from '../server/checkin/group.service.js';

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

    if (body.action === 'group_checkin') {
      respond(res, 200, await groupCheckin({ adminUid: admin.uid, ticketCode: body.ticketCode }), req);
      return;
    }

    const result = await checkinTicket({
      adminUid:   admin.uid,
      ticketCode: body.ticketCode,
      action:     body.action,
    });

    // Скан показывает и остальные брони зрителя на этот сеанс. Только чтение.
    const isInspect = body.action === undefined || body.action === 'inspect';
    const group     = isInspect ? await inspectGroup(result.booking.ticketCode) : null;

    respond(res, 200, group ? { ...result, group } : result, req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Check-in failed');
    if (status >= 500) console.error('[checkin-ticket]', err);
    respond(res, status, payload, req);
  }
}
