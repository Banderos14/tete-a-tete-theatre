// Vercel Serverless Function — POST /api/create-booking.
//
// Хендлер намеренно тонкий: разобрать запрос → проверить токен → вызвать
// сервис → превратить ошибку в ответ. Вся бизнес-логика (вместимость,
// лояльность, идемпотентность, транзакция) живёт в server/booking.
//
// Модель безопасности:
//   - требуется Authorization: Bearer <Firebase ID token>
//   - totalAmount, status, paymentStatus и ticketCode считаются на сервере
//     и никогда не читаются из запроса
//
// Обязательные переменные окружения: FIREBASE_SERVICE_ACCOUNT
// Опционально: ALLOWED_ORIGIN

import type { IncomingMessage, ServerResponse } from 'node:http';
import { respond, readBody } from '../server/shared/http.js';
import { requireCaller } from '../server/shared/auth.js';
import { errorResponse } from '../server/shared/errors.js';
import { validateCreateBooking } from '../server/booking/booking.validation.js';
import { createBooking } from '../server/booking/booking.service.js';
import { sendBookingEmail } from '../server/email/ticketEmail.service.js';

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
    const caller  = await requireCaller(req);
    const request = validateCreateBooking(body);

    const booking = await createBooking({
      ...request,
      uid: caller.uid,
      idempotencyKeyRaw:
        req.headers['idempotency-key'] ??
        (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null),
    });

    // Письмо-билет уходит отсюда, а не из браузера: закрытая вкладка больше
    // не оставляет зрителя без письма. Сбой почты бронь не откатывает, а
    // повтор запроса (тот же Idempotency-Key) не шлёт второе письмо — защита
    // внутри sendBookingEmail; если первое письмо не ушло, повтор его дошлёт.
    const email = await sendBookingEmail(booking.bookingId, 'booking');

    respond(res, 200, { ...booking, ticketEmail: email.status }, req);
  } catch (err) {
    const { status, body: payload } = errorResponse(err, 'Failed to create booking');
    if (status >= 500) console.error('[create-booking]', err);
    respond(res, status, payload, req);
  }
}
