// Vercel Serverless Function — POST /api/delete-user.
//
// Полное удаление пользователя администратором.
// Бизнес-логика и каскад — в server/users/user.service.ts.
//
// Требуемая переменная окружения: FIREBASE_SERVICE_ACCOUNT

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireAdmin } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { deleteUserCompletely } from '../server/users/user.service.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  try {
    const admin = await requireAdmin(req, 'Forbidden: admin only');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      respond(res, 400, { error: 'Invalid JSON' }, req);
      return;
    }

    const result = await deleteUserCompletely(admin.uid, parsed.uid);
    respond(res, 200, result, req);
  } catch (err) {
    // Наружу — нейтральный текст: внутренние подробности инфраструктуры
    // должны оставаться в серверном логе.
    const { status, body } = errorResponse(err, 'Failed to delete user');
    if (status >= 500) console.error('[delete-user]', err);
    respond(res, status, { ok: false, ...body }, req);
  }
}
