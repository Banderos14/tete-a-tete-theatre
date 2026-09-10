import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { missingChars, fontCodepoints } from '../helpers/fontCmap.js';

const ROOT = resolve(__dirname, '../..');
const font = (name: string) => resolve(ROOT, 'public/fonts', name);

// Полный набор французских символов, встречающихся в текстах сайта.
const FRENCH = 'éèêëÉÈÊËàâäÀÂÇçîïÎÏôöÔÙùûüÿŸœŒæÆ';

describe('покрытие французских глифов в шрифтах проекта', () => {
  it('Bad Russian французские акценты НЕ поддерживает — это исходная причина проблемы', () => {
    // Тест фиксирует факт, а не желаемое: шрифт бинарный, без исходника его
    // дорисовать нельзя. Если однажды в файл добавят акценты — тест упадёт,
    // и это будет поводом убрать FR-переопределение в variables.scss.
    const missing = missingChars(font('bad-russian.woff2'), FRENCH);
    expect(missing.length).toBe(FRENCH.length);
  });

  it('Forum покрывает французский полностью — на него и переключается FR', () => {
    expect(missingChars(font('Forum.woff2'), FRENCH)).toEqual([]);
  });

  it('Forum покрывает кириллицу — общий фолбэк ничего не ломает в RU', () => {
    expect(missingChars(font('Forum.woff2'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ')).toEqual([]);
  });

  it('Ekaterina Velikaya Two тоже покрывает французский (используется в hero)', () => {
    expect(missingChars(font('ekaterinavelikayatwo.woff2'), FRENCH)).toEqual([]);
  });

  it('оба формата Bad Russian имеют одинаковое покрытие', () => {
    expect(fontCodepoints(font('bad-russian.woff2')).size)
      .toBe(fontCodepoints(font('bad-russian.woff')).size);
  });
});

describe('CSS-переменные шрифтов', () => {
  const variables = readFileSync(resolve(ROOT, 'src/styles/variables.scss'), 'utf8');
  const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

  it('--font-display имеет явный запасной шрифт, а не голый "Bad Russian"', () => {
    expect(variables).toMatch(/--font-display:\s*"Bad Russian",\s*"Forum",\s*serif/);
    expect(indexHtml).toContain('--font-display:"Bad Russian","Forum",serif');
  });

  it('во французской версии display-шрифт полностью заменён на Forum', () => {
    expect(variables).toMatch(/html\[lang='fr'\][\s\S]*--font-display:\s*"Forum",\s*serif/);
    expect(indexHtml).toContain("html[lang='fr']{--font-display:\"Forum\",serif");
  });

  it('FR-правило есть и в критическом инлайновом CSS — первый кадр уже верный', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</style>'));
    expect(head).toContain("html[lang='fr']");
  });
});
