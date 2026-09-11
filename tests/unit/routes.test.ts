import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(__dirname, '../../src/app/App.tsx'), 'utf8');

describe('маршруты', () => {
  it('есть catch-all маршрут — неизвестный URL больше не даёт белый экран', () => {
    expect(app).toContain('path="*"');
    expect(app).toContain('NotFoundPage');
  });

  it('известные маршруты на месте', () => {
    for (const path of ['path="/"', 'path="/admin"', 'path="/admin/checkin"']) {
      expect(app).toContain(path);
    }
  });

  it('catch-all объявлен ПОСЛЕ конкретных маршрутов', () => {
    expect(app.indexOf('path="/admin/checkin"')).toBeLessThan(app.indexOf('path="*"'));
  });

  it('каждый ленивый маршрут под границей ошибок', () => {
    for (const label of ['AdminPage', 'TicketCheckPage', 'NotFoundPage']) {
      expect(app).toContain(`<ErrorBoundary label="${label}"`);
    }
  });
});

describe('версия роутера закрывает известные advisories', () => {
  it('react-router-dom не ниже 7.18.2', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const range = pkg.dependencies['react-router-dom']!;
    const [major, minor, patch] = range.replace(/^[^\d]*/, '').split('.').map(Number);
    expect(major).toBe(7);
    // Диапазон уязвимостей заканчивается на 7.18.2 (CSRF в RSC-режиме).
    expect(minor! > 18 || (minor === 18 && patch! >= 2)).toBe(true);
  });
});
