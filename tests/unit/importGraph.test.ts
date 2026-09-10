import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

// Регрессионный тест к TTT-03.
//
// firebase/config.ts бросает исключение прямо при вычислении модуля, если Firebase
// не смог инициализироваться. Пока этот модуль лежал в СТАТИЧЕСКОМ графе импортов
// лендинга (App → Afisha → ShowModal → bookingService → firebase/config), такая
// ошибка убивала страницу ДО монтирования React — граница ошибок поймать её не может.
//
// Тест следит, чтобы Firebase больше никогда не попадал в статический граф main.tsx.
// Ленивые ветки (React.lazy / dynamic import) намеренно не раскрываются.

const SRC = resolve(__dirname, '../../src');
const STATIC_IMPORT_RE = /^\s*import\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_RE   = /^\s*import\s+['"]([^'"]+)['"]/gm;
// Реэкспорты из index.ts — тоже часть статического графа, без них обход
// останавливался бы на каждом barrel-файле.
const EXPORT_FROM_RE   = /^\s*export\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/gm;

function resolveModule(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`,
    join(base, 'index.ts'), join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { /* пробуем следующий */ }
  }
  return null;
}

function staticGraphFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let code: string;
    try { code = readFileSync(file, 'utf8'); } catch { continue; }
    for (const re of [STATIC_IMPORT_RE, SIDE_EFFECT_RE, EXPORT_FROM_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const next = resolveModule(file, m[1]!);
        if (next && !next.endsWith('.scss') && !next.endsWith('.css')) queue.push(next);
      }
    }
  }
  return seen;
}

describe('статический граф импортов лендинга', () => {
  const graph = staticGraphFrom(join(SRC, 'main.tsx'));

  it('не содержит firebase/config', () => {
    const offenders = [...graph].filter(f => f.includes('firebase/config'));
    expect(offenders, 'firebase/config снова попал в синхронный чанк лендинга').toEqual([]);
  });

  it('не содержит сервисы, статически завязанные на Firebase', () => {
    const offenders = [...graph].filter(f =>
      f.endsWith('services/bookingService.ts') || f.endsWith('services/userService.ts'),
    );
    expect(offenders).toEqual([]);
  });

  it('обход действительно доходит до ShowModal — именно он раньше тянул Firebase', () => {
    const reached = [...graph].some(f => f.endsWith('ShowModal/ShowModal.tsx'));
    expect(reached, 'обход графа не дошёл до ShowModal — тест перестал что-либо проверять').toBe(true);
    expect(graph.size).toBeGreaterThan(10);
  });
});

describe('границы ошибок подключены', () => {
  it('main.tsx оборачивает приложение в ErrorBoundary', () => {
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
    expect(main).toContain('ErrorBoundary');
    expect(main).toContain('RootErrorScreen');
  });

  it('каждая ленивая модалка в App.tsx под своей границей', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    for (const label of ['AuthModal', 'ProfileDrawer', 'BookingModal']) {
      expect(app).toContain(`<ErrorBoundary label="${label}">`);
    }
  });

  it('загрузка Firebase в AuthContext имеет catch', () => {
    const ctx = readFileSync(join(SRC, 'context/AuthContext.tsx'), 'utf8');
    expect(ctx).toMatch(/loadFirebase\(\)[\s\S]*\.catch\(/);
  });
});
