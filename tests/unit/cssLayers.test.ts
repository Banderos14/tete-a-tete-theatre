import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const variables = readFileSync(join(ROOT, 'src/styles/variables.scss'), 'utf8');

function walkScss(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walkScss(full, out);
    else if (e.endsWith('.scss')) out.push(full);
  }
  return out;
}

const scssFiles = walkScss(join(ROOT, 'src'));

describe('слои z-index собраны в одном месте', () => {
  const tokens = [...variables.matchAll(/--z-([a-z-]+):\s*(\d+);/g)]
    .map(m => ({ name: m[1]!, value: Number(m[2]!) }));

  it('токены объявлены', () => {
    expect(tokens.length).toBeGreaterThanOrEqual(10);
  });

  it('порядок слоёв строго возрастает — стек читается сверху вниз', () => {
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]!.value, `${tokens[i]!.name} после ${tokens[i - 1]!.name}`)
        .toBeGreaterThanOrEqual(tokens[i - 1]!.value);
    }
  });

  it('баннер согласия — самый верхний слой', () => {
    const max = Math.max(...tokens.map(t => t.value));
    expect(tokens.find(t => t.name === 'consent')!.value).toBe(max);
  });

  it('модалка бронирования выше модалки спектакля', () => {
    const byName = Object.fromEntries(tokens.map(t => [t.name, t.value]));
    expect(byName['booking']).toBeGreaterThan(byName['modal']!);
    expect(byName['modal']).toBeGreaterThan(byName['drawer']!);
    expect(byName['drawer']).toBeGreaterThan(byName['header']!);
  });

  it('в компонентах не осталось «магических» слоёв со значением >= 100', () => {
    const offenders: string[] = [];
    for (const file of scssFiles) {
      if (file.endsWith('variables.scss')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/z-index:\s*(\d{3,})/g)) {
        offenders.push(`${file.replace(ROOT + '/', '')}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('!important задокументирован', () => {
  it('в variables.scss объяснено, почему оставшиеся не убраны', () => {
    expect(variables).toContain('Про !important');
    expect(variables).toContain('html5-qrcode');
    expect(variables).toContain('prefers-reduced-motion');
  });

  it('избыточное объявление в Hero удалено', () => {
    const hero = readFileSync(join(ROOT, 'src/pages/HomePage/sections/Hero/Hero.module.scss'), 'utf8');
    expect(hero).not.toContain('border-top: none !important');
    expect(hero).toContain('border-top: none;');
  });

  it('отключение анимаций для prefers-reduced-motion сохранено', () => {
    const hero = readFileSync(join(ROOT, 'src/pages/HomePage/sections/Hero/Hero.module.scss'), 'utf8');
    expect(hero).toContain('animation: none !important');
  });
});
