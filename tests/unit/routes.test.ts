import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(__dirname, '../../src/App.tsx'), 'utf8');

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
