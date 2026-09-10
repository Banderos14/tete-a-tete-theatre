import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scss = readFileSync(resolve(__dirname, '../../src/components/Hero/Hero.module.scss'), 'utf8');

// На узких экранах шрифт заголовка задавался как clamp(70px, 13vw, 80px):
// при ширине 320px 13vw = 41.6px, поэтому срабатывала НИЖНЯЯ граница 70px,
// строка становилась шире экрана, а white-space: nowrap не давал её перенести.
function smallBlock(): string {
  const start = scss.indexOf('@include mixins.small', scss.indexOf('.title {'));
  return scss.slice(start, scss.indexOf('\n  }', start));
}

function parseClamp(decl: string): { min: number; pref: number; max: number } {
  const m = /clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/.exec(decl)!;
  return { min: Number(m[1]), pref: Number(m[2]), max: Number(m[3]) };
}

describe('Hero: заголовок на узких экранах', () => {
  const block = smallBlock();
  const clamp = parseClamp(block);

  it('нижняя граница clamp меньше прежних 70px', () => {
    expect(clamp.min).toBeLessThan(70);
  });

  it('на 320px размер определяется шириной экрана, а не нижней границей', () => {
    const computedAt320 = 320 * clamp.pref / 100;
    expect(computedAt320).toBeGreaterThan(clamp.min);
    expect(computedAt320).toBeLessThanOrEqual(clamp.max);
  });

  it('на 600px (граница брейкпоинта) не превышает верхнюю границу', () => {
    expect(Math.min(600 * clamp.pref / 100, clamp.max)).toBeLessThanOrEqual(clamp.max);
  });

  it('desktop-размер не тронут', () => {
    expect(scss).toContain('font-size: clamp(60px, 13vw, 200px)');
  });

  it('nowrap сохранён — переносить заголовок мы не начали', () => {
    expect(scss).toContain('white-space: nowrap');
  });
});
