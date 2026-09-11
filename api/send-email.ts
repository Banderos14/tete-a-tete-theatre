// Vercel Serverless Function — POST /api/send-email.
//
// Тонкий хендлер: разобрать тело → проверить токен и права → лимит → отправка.
// Вся логика — в server/email.
//
// Требуемые переменные окружения (только на сервере, без префикса VITE_):
//   RESEND_API_KEY           — ключ resend.com
//   EMAIL_FROM               — подтверждённый отправитель
//   FIREBASE_SERVICE_ACCOUNT — сервисный аккаунт (нужен для проверки роли)
// Опционально: ALLOWED_ORIGIN

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireCaller } from '../server/shared/auth.js';
import { errorResponse, ApiError } from '../server/shared/errors.js';
import { validateEmailType, validateEmailPayload } from '../server/email/email.validation.js';
import { authorizeEmail, enforceEmailRateLimit, sendEmail } from '../server/email/email.service.js';

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
    // Тип проверяется до авторизации: от него зависит текст ответа 401.
    const type = validateEmailType(body.type);

    let caller;
    try {
      caller = await requireCaller(req);
    } catch {
      respond(res, 401, { error: `${type} requires Authorization: Bearer <token>` }, req);
      return;
    }

    const { isAdmin } = await authorizeEmail(type, caller.uid);
    await enforceEmailRateLimit(caller.uid, isAdmin);

    const request = validateEmailPayload(type, body);
    const result  = await sendEmail(request, caller.uid);

    respond(res, 200, result, req);
  } catch (err) {
    // 429 несёт Retry-After — заголовок, которого нет у остальных ответов.
    if (err instanceof ApiError && err.status === 429) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After':  String(err.details?.retryAfterSeconds ?? 60),
      });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }

    const { status, body: payload } = errorResponse(err, 'Internal server error');
    if (status >= 500) console.error('[send-email]', err);
    respond(res, status, payload, req);
  }
}
