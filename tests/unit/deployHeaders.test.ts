import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
  rewrites?: { source: string; destination: string }[];
};

const globalHeaders = vercel.headers.find(h => h.source === '/(.*)')!;
const get = (key: string) =>
  globalHeaders.headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value;

describe('заголовки безопасности продакшена', () => {
  it('сайт нельзя встроить в чужой iframe', () => {
    expect(get('Content-Security-Policy')).toBe("frame-ancestors 'self'");
  });

  it('нет wildcard frame-ancestors — это и был clickjacking', () => {
    expect(get('Content-Security-Policy')).not.toContain('*');
  });

  it('X-Frame-Options содержит валидное значение (ALLOWALL таким не является)', () => {
    expect(['SAMEORIGIN', 'DENY']).toContain(get('X-Frame-Options'));
  });

  it('запрещено угадывание MIME-типа', () => {
    expect(get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('referrer не утекает на сторонние сайты целиком', () => {
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('SPA-rewrite остался на месте', () => {
  it('все пути ведут на index.html', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });
});
