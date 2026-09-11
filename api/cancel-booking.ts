// Vercel Serverless Function — POST /api/cancel-booking.
//
// Отмена зрителем. Раньше клиент писал её прямо в Firestore, но правила
// безопасности такую запись не пропускают — и не должны: проверка владения
// и бизнес-правил обязана происходить на сервере.
//
// Бизнес-логика — в server/booking/cancellation.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireCaller } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { cancelBookingByUser } from '../server/booking/cancellation.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  try {
    const caller = await requireCaller(req);
    const result = await cancelBookingByUser({
      uid:       caller.uid,
      bookingId: body.bookingId,
      reason:    body.reason,
      comment:   body.comment,
    });
    respond(res, 200, result, req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Failed to cancel booking');
    if (status >= 500) console.error('[cancel-booking]', err);
    respond(res, status, payload, req);
  }
}
