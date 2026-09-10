import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Регрессионный тест к TTT-05.
//
// Ссылка на /fonts/Inter-Regular.ttf годами указывала на файл, которого в
// репозитории нет. Из-за SPA-rewrite такой запрос возвращает index.html со
// статусом 200, поэтому ошибка нигде не всплывала. Тест ловит весь класс
// «ссылаемся на ассет, которого нет».

const ROOT   = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Пути к статике, встречающиеся в исходниках как строковые литералы.
const ASSET_RE = /['"`](\/(?:fonts|images|icons)\/[A-Za-z0-9._\-/]+)['"`]/g;

describe('ссылки на статику указывают на существующие файлы', () => {
  const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];

  const referenced = new Map<string, string>();
  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    ASSET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASSET_RE.exec(code)) !== null) {
      referenced.set(m[1]!, file.replace(ROOT + '/', ''));
    }
  }

  it('тест действительно что-то нашёл', () => {
    expect(referenced.size).toBeGreaterThan(0);
  });

  it('каждый упомянутый ассет существует в public/', () => {
    const missing = [...referenced.entries()]
      .filter(([path]) => !existsSync(join(PUBLIC, path)))
      .map(([path, from]) => `${path} (упомянут в ${from})`);
    expect(missing).toEqual([]);
  });
});

describe('PDF-билет не ссылается на отсутствующий шрифт', () => {
  const pdfService = readFileSync(join(ROOT, 'src/services/ticketPdfService.ts'), 'utf8');

  it('загрузка шрифта проверяет сигнатуру, а не только res.ok', () => {
    expect(pdfService).toContain('isSfntFontBinary');
    expect(pdfService).toContain('isPlausibleFontContentType');
  });

  it('жёсткой ссылки на Inter-Regular.ttf больше нет', () => {
    expect(pdfService).not.toContain("'/fonts/Inter-Regular.ttf'");
  });

  it('декоративный шрифт билета реально существует', () => {
    expect(existsSync(join(PUBLIC, 'fonts/ekaterinavelikayatwo.ttf'))).toBe(true);
  });
});
