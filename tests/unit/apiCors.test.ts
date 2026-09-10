import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const API  = join(ROOT, 'api');

// Все endpoint'ы: файлы верхнего уровня api/, кроме служебной папки _lib.
const endpoints = readdirSync(API).filter(f => f.endsWith('.ts'));
const http = readFileSync(join(API, '_lib/http.ts'), 'utf8');

describe('общие CORS-заголовки', () => {
  it('endpoint\'ы найдены', () => {
    expect(endpoints.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of endpoints) {
    it(`${file} использует общие хелперы, а не свою копию CORS`, () => {
      const src = readFileSync(join(API, file), 'utf8');
      expect(src).toContain("from './_lib/http.js'");
      expect(src, 'локальная копия ALLOWED_ORIGINS').not.toContain('const ALLOWED_ORIGINS');
      expect(src, 'локальная копия getCorsOrigin').not.toContain('function getCorsOrigin');
    });

    it(`${file} отвечает на OPTIONS`, () => {
      const src = readFileSync(join(API, file), 'utf8');
      expect(src).toMatch(/req\.method === 'OPTIONS'/);
    });
  }
});

describe('содержимое общих заголовков', () => {
  it('preflight пропускает Authorization и Idempotency-Key', () => {
    expect(http).toContain("'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key'");
  });

  it('перечислены разрешённые методы', () => {
    expect(http).toContain("'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'");
  });

  it('есть Vary: Origin — ответы кешируются по origin', () => {
    expect(http).toContain("'Vary':                         'Origin'");
  });

  it('wildcard origin не используется — запросы несут Authorization', () => {
    expect(http).not.toMatch(/Access-Control-Allow-Origin['"]\s*:\s*['"]\*/);
  });

  it('в список разрешённых origin добавлен реальный порт dev-сервера', () => {
    expect(http).toContain('http://localhost:5174');
  });

  it('тело запроса ограничено по размеру', () => {
    expect(http).toContain('MAX_BODY_BYTES');
    expect(http).toContain('Request body too large');
  });
});
