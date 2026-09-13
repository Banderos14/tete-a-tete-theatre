// Vercel Serverless Function — /api/newsletter. Только администратор.
//
//   GET  — preflight: число получателей и оценка дневной квоты Resend.
//   POST — отправка анонса { showId, drafts: { RU, FR } }. Квота проверяется
//          заново перед первым письмом; не хватает — 409, ничего не отправлено.
//
// Логика — в server/email/newsletter.service.ts.
// Переменные окружения (только сервер): RESEND_API_KEY, EMAIL_FROM,
// FIREBASE_SERVICE_ACCOUNT; опционально RESEND_DAILY_LIMIT (по умолчанию 100).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireAdmin } from '../server/shared/auth.js';
import { errorResponse, badRequest } from '../server/shared/errors.js';
import {
  newsletterPreflight, sendNewsletter, validateNewsletterRequest,
} from '../server/email/newsletter.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET' && req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' }, req);
    return;
  }

  try {
    // Право проверяется первым: без роли admin нельзя узнать даже число получателей.
    const caller = await requireAdmin(req, 'Newsletter is admin-only');

    if (req.method === 'GET') {
      respond(res, 200, await newsletterPreflight(), req);
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      throw badRequest('Invalid JSON body');
    }

    const request = validateNewsletterRequest(body);
    respond(res, 200, await sendNewsletter(request, caller.uid), req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Internal server error');
    if (status >= 500) console.error('[newsletter]', err);
    respond(res, status, payload, req);
  }
}
