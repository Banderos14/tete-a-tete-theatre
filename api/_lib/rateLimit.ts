// Простой лимитер на Firestore.
//
// Специально без Redis и внешних сервисов: у театра десятки запросов в день,
// а серверless-функции не имеют общей памяти между инстансами, поэтому
// счётчик должен жить в общем хранилище. Firestore уже есть в проекте.
//
// Документ: rateLimits/{bucket}. Транзакция гарантирует, что параллельные
// запросы не «протолкнут» лишние операции сверх лимита.

import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  resetAtMs:  number;
}

export interface RateLimitOptions {
  /** Идентификатор корзины, например `email:<uid>`. */
  bucket:     string;
  /** Сколько операций разрешено за окно. */
  limit:      number;
  /** Длина окна в миллисекундах. */
  windowMs:   number;
}

export async function consumeRateLimit(
  db: Firestore,
  { bucket, limit, windowMs }: RateLimitOptions,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const ref = db.collection('rateLimits').doc(bucket.replace(/\//g, '_'));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() as { count?: number; windowStartMs?: number } : null;

    const prev = data && typeof data.windowStartMs === 'number'
      ? { count: typeof data.count === 'number' ? data.count : 0, windowStartMs: data.windowStartMs }
      : null;

    const decision  = decideRateLimit(prev, limit, windowMs, nowMs);
    const startMs   = decision.windowStartMs;
    const resetAtMs = startMs + windowMs;

    if (!decision.allowed) {
      return { allowed: false, remaining: 0, resetAtMs };
    }

    tx.set(ref, {
      count:         decision.nextCount,
      windowStartMs: startMs,
      updatedAt:     FieldValue.serverTimestamp(),
      // Поле для TTL-политики Firestore, если её включат: документы лимитов
      // не должны копиться вечно.
      expiresAt:     Timestamp.fromMillis(resetAtMs + windowMs),
    }, { merge: true });

    return { allowed: true, remaining: limit - decision.nextCount, resetAtMs };
  });
}

// Чистая функция принятия решения — вынесена, чтобы её можно было тестировать
// без Firestore. Транзакция выше применяет ровно эту логику.
export function decideRateLimit(
  state: { count: number; windowStartMs: number } | null,
  limit: number,
  windowMs: number,
  nowMs: number,
): { allowed: boolean; nextCount: number; windowStartMs: number } {
  // Корзины ещё не было — окно начинается прямо сейчас.
  if (!state) return { allowed: limit > 0, nextCount: 1, windowStartMs: nowMs };

  const expired = nowMs - state.windowStartMs >= windowMs;
  const count   = expired ? 0 : state.count;
  const startMs = expired ? nowMs : state.windowStartMs;

  if (count >= limit) return { allowed: false, nextCount: count, windowStartMs: startMs };
  return { allowed: true, nextCount: count + 1, windowStartMs: startMs };
}
