// Vercel Serverless Function — POST /api/admin-booking.
//
// Все админские действия с бронью: проверка билета и проход (сканер),
// оплата, «принять оплату и пропустить», отмена, снятие оплаты, повторная
// отправка билета, удаление отменённой брони. Один endpoint вместо трёх —
// лимит функций Hobby-плана Vercel.
//
// Бизнес-логика — в server/admin/adminBooking.service.ts.
// Требуемые переменные окружения: FIREBASE_SERVICE_ACCOUNT; для писем
// RESEND_API_KEY и EMAIL_FROM.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireAdmin } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { runAdminBookingAction } from '../server/admin/adminBooking.service.js';

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

    respond(res, 200, await runAdminBookingAction(admin.uid, body), req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Admin booking action failed');
    if (status >= 500) console.error('[admin-booking]', err);
    respond(res, status, payload, req);
  }
}
