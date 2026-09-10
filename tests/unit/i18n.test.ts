import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const ru   = readFileSync(join(ROOT, 'src/i18n/ru.ts'), 'utf8');
const fr   = readFileSync(join(ROOT, 'src/i18n/fr.ts'), 'utf8');
const types = readFileSync(join(ROOT, 'src/i18n/types.ts'), 'utf8');
const shows = readFileSync(join(ROOT, 'src/data/shows.ts'), 'utf8');

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

function sectionOf(src: string, name: string): string {
  const start = src.indexOf(`  ${name}: {`);
  return src.slice(start, src.indexOf('  },\n', start));
}

describe('месяцы', () => {
  it('все 12 месяцев есть в русском словаре', () => {
    const block = sectionOf(ru, 'months');
    for (const m of MONTHS) expect(block, m).toContain(`'${m}'`);
  });

  it('все 12 месяцев есть во французском словаре', () => {
    const block = sectionOf(fr, 'months');
    for (const m of MONTHS) expect(block, m).toContain(`'${m}'`);
  });

  it('во французских месяцах не осталось кириллических ЗНАЧЕНИЙ', () => {
    const block = sectionOf(fr, 'months');
    const values = [...block.matchAll(/'[^']+':\s*'([^']+)'/g)].map(m => m[1]!);
    expect(values).toHaveLength(12);
    for (const v of values) expect(v, `значение «${v}»`).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('ключи месяцев типизированы, а не Record<string, string>', () => {
    expect(types).toContain('months: Record<MonthKey, string>');
    expect(types).toContain("export type MonthKey");
  });
});

describe('жанры спектаклей', () => {
  it('каждый tag из данных переведён на французский', () => {
    const used = [...shows.matchAll(/tag: '([^']+)'/g)].map(m => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    const block = sectionOf(fr, 'showTags');
    for (const tag of new Set(used)) {
      expect(block, `жанр «${tag}» без французского перевода`).toContain(`'${tag}'`);
    }
  });

  it('«Поэзия» больше не выпадает во французской версии', () => {
    expect(sectionOf(fr, 'showTags')).toContain("'Поэзия': 'Poésie'");
  });

  it('во французских жанрах нет кириллических значений', () => {
    const values = [...sectionOf(fr, 'showTags').matchAll(/'[^']+':\s*'([^']+)'/g)].map(m => m[1]!);
    for (const v of values) expect(v, `значение «${v}»`).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('ключи жанров типизированы', () => {
    expect(types).toContain('showTags: Record<ShowTagKey, string>');
    expect(types).toContain('export type ShowTagKey');
  });

  it('поля данных типизированы теми же ключами — компилятор ловит пропуск', () => {
    const showTypes = readFileSync(join(ROOT, 'src/types/show.ts'), 'utf8');
    expect(showTypes).toContain('month: MonthKey');
    expect(showTypes).toContain('tag: ShowTagKey');
  });
});

describe('прочие таблицы месяцев покрывают весь год', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it('каждая таблица перевода месяцев в src содержит 12 записей', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const code = readFileSync(file, 'utf8');
      // таблицы вида MONTH_..._MAP / MONTHS_... с ключами-месяцами
      for (const m of code.matchAll(/const (MONTH[A-Z_]*)\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\n\};/g)) {
        const [, name, body] = m;
        if (!MONTHS.some(mm => body!.includes(`'${mm}'`))) continue;
        const present = MONTHS.filter(mm => body!.includes(`'${mm}'`));
        if (present.length !== 12) {
          offenders.push(`${file.replace(ROOT + '/', '')}: ${name} — ${present.length}/12`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
