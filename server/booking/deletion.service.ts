// Окончательное удаление отменённой брони администратором.
//
// Это HARD DELETE, а не ещё один статус: список «Отменено» иначе растёт без
// предела. Поэтому правило удаления жёсткое и проверяется НА СЕРВЕРЕ, а не в
// интерфейсе — удалить можно только бронь со статусом cancelled.
//
// Что удаляется вместе с бронью и почему:
//
//   bookings/{id}                   — сам документ;
//   idempotencyKeys/booking_*       — ключ хранит bookingId и создаётся в одной
//                                     транзакции с бронью. Если оставить его,
//                                     повторный запрос с тем же Idempotency-Key
//                                     вернёт клиенту ссылку на несуществующую
//                                     бронь — висячая ссылка, которую уже никак
//                                     не увидеть и не починить.
//
// Что НЕ трогаем и почему:
//
//   loyaltyState/{uid}   — счётчик израсходованных бонусов. Он специально
//                          хранится отдельно от истории: computeLoyalty берёт
//                          max(истории, счётчика), поэтому удаление брони со
//                          скидкой не возвращает пользователю уже потраченный
//                          бонус. Обнулять его здесь было бы выдачей скидки.
//   showCounters/{showId} — точка сериализации транзакций, вместимость всегда
//                          пересчитывается запросом. Отменённая бронь места и
//                          так не занимала (occupiesCapacity), удалять нечего.
//   emailLog             — технический журнал доставки, привязан к uid и типу
//                          письма, а не к брони. Это операционная история
//                          театра, а не данные брони.
//   users, audienceCounted — данные пользователя, к одной броне отношения не имеют.
//
// Письма здесь НЕ отправляются: письмо об отмене ушло при самой отмене,
// а удаление — административная уборка, о которой зрителю знать незачем.

import type { Firestore } from 'firebase-admin/firestore';
import { badRequest, notFound, conflict } from '../shared/errors.js';
import { db, BOOKINGS, IDEMPOTENCY_KEYS } from './booking.repository.js';

/** Идентификатор документа Firestore: без слэшей и служебных путей. */
const SAFE_DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface DeleteBookingResult {
  ok: true;
  bookingId: string;
  /** Сколько ключей идемпотентности ушло вместе с бронью (обычно 0 или 1). */
  idempotencyKeysDeleted: number;
}

function parseBookingId(raw: unknown): string {
  if (typeof raw !== 'string') throw badRequest('Missing bookingId');
  const value = raw.trim();
  // Идентификатор подставляется в путь документа, поэтому проверяется строго:
  // строка со слэшем адресовала бы совсем другой документ.
  if (!SAFE_DOC_ID_RE.test(value)) throw badRequest('Invalid bookingId');
  return value;
}

export async function deleteCancelledBooking(
  adminUid: string,
  bookingIdRaw: unknown,
  database: Firestore = db(),
): Promise<DeleteBookingResult> {
  const bookingId = parseBookingId(bookingIdRaw);
  const ref = database.collection(BOOKINGS).doc(bookingId);

  const outcome = await database.runTransaction(async (tx) => {
    // Статус перечитывается ВНУТРИ транзакции: между открытием админки и
    // нажатием на корзину бронь могли вернуть в работу, и удалять её нельзя.
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'missing' as const };

    const status = String((snap.data() as Record<string, unknown>).status ?? '');
    if (status !== 'cancelled') return { kind: 'not_cancelled' as const, status };

    // Ключи идемпотентности читаются до записей — иначе транзакция Firestore
    // отвергнет чтение после первой операции записи.
    const keys = await tx.get(
      database.collection(IDEMPOTENCY_KEYS).where('bookingId', '==', bookingId),
    );

    for (const key of keys.docs) tx.delete(key.ref);
    tx.delete(ref);

    return { kind: 'deleted' as const, idempotencyKeysDeleted: keys.size };
  });

  if (outcome.kind === 'missing') throw notFound('Booking not found', 'not_found');
  if (outcome.kind === 'not_cancelled') {
    throw conflict(
      'Only cancelled bookings can be deleted',
      'not_cancelled',
      { status: outcome.status },
    );
  }

  console.log(
    `[delete-booking] id=${bookingId} by=${adminUid} idempotencyKeys=${outcome.idempotencyKeysDeleted}`,
  );
  return {
    ok: true,
    bookingId,
    idempotencyKeysDeleted: outcome.idempotencyKeysDeleted,
  };
}
