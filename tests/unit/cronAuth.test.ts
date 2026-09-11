import { describe, it, expect, afterEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { requireCronSecret } from '../../server/shared/auth.js';
import { ApiError } from '../../server/shared/errors.js';
import { endpointSource, functionBody } from '../helpers/serverSource.js';

// Доступ к cron-endpoint'у закрыт по умолчанию.
//
// Регрессия, ради которой написан файл: проверка выглядела как
// `if (secret && bearerToken(req) !== secret)`. Незаданная переменная окружения
// не закрывала endpoint, а ОТКРЫВАЛА его — аннулировать чужие брони мог кто
// угодно, просто дёрнув URL.

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

/** Минимальный запрос: requireCronSecret читает только заголовки. */
function req(authorization?: string): IncomingMessage {
  return { headers: authorization === undefined ? {} : { authorization } } as IncomingMessage;
}

function refusal(fn: () => void): ApiError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('ожидался отказ, но проверка пропустила запрос');
}

describe('requireCronSecret: fail closed', () => {
  it('без CRON_SECRET на сервере задача не выполняется', () => {
    delete process.env.CRON_SECRET;
    // Даже «правильно выглядящий» заголовок не помогает: сверять не с чем.
    expect(refusal(() => requireCronSecret(req('Bearer whatever'))).status).toBe(401);
    expect(refusal(() => requireCronSecret(req())).status).toBe(401);
  });

  it('пустая строка в переменной считается отсутствием секрета', () => {
    process.env.CRON_SECRET = '';
    expect(refusal(() => requireCronSecret(req('Bearer '))).status).toBe(401);
  });

  it('без заголовка Authorization — 401', () => {
    process.env.CRON_SECRET = 'test-secret-value';
    expect(refusal(() => requireCronSecret(req())).status).toBe(401);
  });

  it('неправильный Bearer-токен — 401', () => {
    process.env.CRON_SECRET = 'test-secret-value';
    expect(refusal(() => requireCronSecret(req('Bearer wrong-value'))).status).toBe(401);
  });

  it('правильный токен пропускается', () => {
    process.env.CRON_SECRET = 'test-secret-value';
    expect(() => requireCronSecret(req('Bearer test-secret-value'))).not.toThrow();
  });

  it('схема и регистр значения проверяются строго', () => {
    process.env.CRON_SECRET = 'test-secret-value';
    for (const bad of [
      'test-secret-value',           // без схемы
      'bearer test-secret-value',    // другой регистр схемы
      'Basic test-secret-value',     // чужая схема
      'Bearer Test-Secret-Value',    // другой регистр значения
      'Bearer test-secret-value ',   // хвостовой пробел
      'Bearer test-secret-value-x',  // префикс правильного
      'Bearer test-secret-valu',     // усечённый
    ]) {
      expect(refusal(() => requireCronSecret(req(bad))).status, bad).toBe(401);
    }
  });

  it('отказы неотличимы между собой — по коду и тексту нельзя узнать, настроен ли секрет', () => {
    delete process.env.CRON_SECRET;
    const notConfigured = refusal(() => requireCronSecret(req('Bearer x')));
    process.env.CRON_SECRET = 'test-secret-value';
    const wrongToken = refusal(() => requireCronSecret(req('Bearer x')));
    expect(notConfigured.status).toBe(wrongToken.status);
    expect(notConfigured.message).toBe(wrongToken.message);
  });

  it('значение секрета не попадает в текст ошибки', () => {
    process.env.CRON_SECRET = 'super-secret-do-not-leak';
    const err = refusal(() => requireCronSecret(req('Bearer wrong')));
    expect(err.message).not.toContain('super-secret-do-not-leak');
    expect(JSON.stringify(err.details ?? {})).not.toContain('super-secret-do-not-leak');
  });
});

/** Исходник без комментариев: иначе правило ловит само упоминание старого кода. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('api/expire-bookings: проверка стоит до бизнес-логики', () => {
  const cron    = codeOnly(endpointSource('api/expire-bookings.ts'));
  const handler = functionBody(cron, 'handler');

  it('аннулирование вызывается строго после проверки секрета', () => {
    const checkAt = handler.indexOf('requireCronSecret(req)');
    const jobAt   = handler.indexOf('expireOverdueTransfers()');
    expect(checkAt, 'проверка секрета не найдена').toBeGreaterThan(-1);
    expect(jobAt,   'вызов аннулирования не найден').toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(jobAt);
  });

  it('прежняя fail-open проверка не вернулась', () => {
    // `if (secret && ...)` пропускал запрос, когда переменная не задана.
    expect(cron).not.toMatch(/if\s*\(\s*secret\s*&&/);
  });

  it('секрет не логируется и не уходит в ответ', () => {
    const usages = [...cron.matchAll(/process\.env\.CRON_SECRET/g)];
    expect(usages.length, 'секрет читается ровно в одном месте').toBe(1);
    expect(cron).not.toMatch(/console\.\w+\([^)]*CRON_SECRET/);
    expect(cron).not.toMatch(/respond\([^)]*CRON_SECRET/);
  });

  it('отказ отдаётся через общий errorResponse', () => {
    expect(handler).toContain('errorResponse');
  });
});
