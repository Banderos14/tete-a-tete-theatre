// Нормализация ключа идемпотентности.
//
// Ключ приходит от клиента (заголовок Idempotency-Key или поле тела) и попадает
// в идентификатор документа Firestore, поэтому его нужно жёстко ограничить:
// без слэшей, разумной длины, только безопасные символы.

const MAX_KEY_LEN = 64;
const SAFE_KEY_RE = /^[A-Za-z0-9_-]+$/;

export function normalizeIdempotencyKey(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return null;
  if (!SAFE_KEY_RE.test(trimmed)) return null;

  return trimmed;
}
