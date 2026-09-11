// Vercel Serverless Function — GET /api/show-availability.
//
// Публичный endpoint: отдаёт только числа, без персональных данных.
// Бизнес-логика — в server/availability/availability.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, corsHeaders } from '../server/shared/http.js';
import { readShowAvailability } from '../server/availability/availability.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET')     { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  let shows;
  try {
    shows = await readShowAvailability();
  } catch (err) {
    console.error('[show-availability] read failed:', err);
    respond(res, 503, { error: 'Availability temporarily unavailable' }, req);
    return;
  }

  // Небольшой edge-кэш: остаток мест не обязан быть посекундно точным,
  // а публичный endpoint не должен превращаться в источник лишних чтений Firestore.
  res.writeHead(200, {
    'Content-Type':  'application/json',
    'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=60',
    ...corsHeaders(req),
  });
  res.end(JSON.stringify({ ok: true, shows }));
}
