// Vercel Serverless Function — GET /api/public-ticket?code=XXXX-XXXX.
//
// Публичный: без входа, только чтение, без персональных данных.
// Бизнес-логика — в server/booking/publicTicket.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, corsHeaders, clientIp } from '../server/shared/http.js';
import { errorResponse } from '../server/shared/errors.js';
import { readPublicTicket } from '../server/booking/publicTicket.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET')     { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  const code = new URL(req.url ?? '/', 'http://localhost').searchParams.get('code');
  try {
    const ticket = await readPublicTicket(code, clientIp(req));
    // Статус меняется (оплата, отмена, возврат) — ни браузер, ни Cloudflare не кешируют.
    res.writeHead(200, {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
    });
    res.end(JSON.stringify({ ok: true, ticket }));
  } catch (err) {
    const { status, body } = errorResponse(err, 'Ticket temporarily unavailable');
    if (status >= 500) console.error('[public-ticket]', err);
    respond(res, status >= 500 ? 503 : status, body, req);
  }
}
