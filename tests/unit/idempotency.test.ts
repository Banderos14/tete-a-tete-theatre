import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeIdempotencyKey } from '../../server/shared/idempotency.js';
import { endpointSource, transactionBody } from '../helpers/serverSource.js';

const ROOT = resolve(__dirname, '../..');

describe('normalizeIdempotencyKey', () => {
  it('принимает нормальный ключ', () => {
    expect(normalizeIdempotencyKey('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
    expect(normalizeIdempotencyKey('  key-with_dash  ')).toBe('key-with_dash');
  });

  it('берёт первое значение, если заголовок пришёл массивом', () => {
    expect(normalizeIdempotencyKey(['abc', 'def'])).toBe('abc');
  });

  it('отклоняет слэши — ключ попадает в идентификатор документа Firestore', () => {
    expect(normalizeIdempotencyKey('a/b')).toBeNull();
    expect(normalizeIdempotencyKey('../../etc')).toBeNull();
  });

  it('отклоняет пустое, слишком длинное и небезопасные символы', () => {
    expect(normalizeIdempotencyKey('')).toBeNull();
    expect(normalizeIdempotencyKey('   ')).toBeNull();
    expect(normalizeIdempotencyKey('x'.repeat(65))).toBeNull();
    expect(normalizeIdempotencyKey('key with space')).toBeNull();
    expect(normalizeIdempotencyKey('ключ')).toBeNull();
  });

  it('отклоняет не-строки', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(normalizeIdempotencyKey(v)).toBeNull();
  });
});

describe('/api/create-booking: идемпотентность', () => {
  const src = endpointSource('api/create-booking.ts');

  it('ключ читается из заголовка Idempotency-Key', () => {
    expect(src).toContain("req.headers['idempotency-key']");
  });

  it('ключ привязан к пользователю — чужой занять нельзя', () => {
    expect(src).toContain('`booking_${uid}_${idempotencyKey}`');
  });

  it('повтор отдаёт прежнюю бронь, а не создаёт новую', () => {
    expect(src).toContain('replayed: true');
    expect(src).toMatch(/idemSnap\.exists/);
  });

  it('ключ пишется в ТОЙ ЖЕ транзакции, что и бронь', () => {
    const tx = transactionBody(src);
    expect(tx).toContain('tx.create(idemRef');
    expect(tx).toContain('tx.create(bookingRef');
  });

  it('проверка ключа идёт до записей — требование Firestore', () => {
    expect(src.indexOf('tx.get(idemRef)')).toBeLessThan(src.indexOf('tx.create(bookingRef'));
  });
});

describe('фронтенд: ключ на попытку, а не на весь сеанс', () => {
  const modal   = readFileSync(resolve(ROOT, 'src/components/ui/BookingModal/BookingModal.tsx'), 'utf8');
  const service = readFileSync(resolve(ROOT, 'src/services/bookingService.ts'), 'utf8');

  it('ключ генерируется криптографически', () => {
    expect(service).toContain('crypto.getRandomValues');
  });

  it('заголовок отправляется', () => {
    expect(service).toContain("'Idempotency-Key': idempotencyKey");
  });

  it('ключ обновляется при открытии модалки — новая покупка не блокируется', () => {
    expect(modal).toMatch(/idempotencyKeyRef\.current = newIdempotencyKey\(\)/);
  });

  it('повторный submit при активной отправке отсекается', () => {
    expect(modal).toContain('if (submitLoading) return;');
  });
});
