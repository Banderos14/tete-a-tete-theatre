// Vercel Serverless Function — POST /api/register-audience.
//
// Учёт нового зрителя в публичном счётчике.
// Бизнес-логика — в server/audience/audience.service.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond } from '../server/shared/http.js';
import { requireCaller } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { registerAudienceMember } from '../server/audience/audience.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  try {
    const caller  = await requireCaller(req);
    const counted = await registerAudienceMember(caller.uid);
    respond(res, 200, { ok: true, counted }, req);
  } catch (err) {
    const { status, body } = errorResponse(err, 'Failed to register audience member');
    if (status >= 500) {
      // Счётчик некритичен — не блокируем регистрацию пользователя.
      console.error('[register-audience]', err);
      respond(res, 200, { ok: false, counted: false }, req);
      return;
    }
    respond(res, status, body, req);
  }
}
