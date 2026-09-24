// Протухание брони — один переход на все пути.
//
// Им пользуются cron для переводов (server/expiration), webhook и сверка
// онлайн-оплаты (server/payments). Поля одинаковые, поэтому «протухшая» бронь
// выглядит одинаково независимо от того, кто её аннулировал: место и скидка
// лояльности освобождаются существующим правилом occupiesCapacity.
//
// Функция только записывает — решение «можно ли протухать» принимает
// вызывающий, прочитав бронь В ЭТОЙ ЖЕ транзакции.

import { FieldValue, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { SHOW_COUNTERS } from './booking.repository.js';

export function applyExpiry(
  tx: Transaction,
  database: Firestore,
  ref: DocumentReference,
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): string {
  const showId = String(data.showId ?? '');
  // Счётчик спектакля — точка конфликта с параллельным бронированием.
  if (showId) {
    tx.set(database.collection(SHOW_COUNTERS).doc(showId),
      { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  tx.update(ref, {
    paymentStatus: 'expired',
    status:        'cancelled',
    expiredAt:     FieldValue.serverTimestamp(),
    updatedAt:     FieldValue.serverTimestamp(),
    ...extra,
  });
  return showId;
}
