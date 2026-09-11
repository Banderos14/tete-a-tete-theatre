import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Границы слоёв. Тест не про красоту дерева, а про утечки: серверные ключи
// и Admin SDK не должны оказаться в бандле, который скачивает браузер.

const ROOT = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

const srcFiles    = walk(join(ROOT, 'src'));
const sharedFiles = walk(join(ROOT, 'shared'));
const serverFiles = walk(join(ROOT, 'server'));
const apiFiles    = readdirSync(join(ROOT, 'api')).filter(f => f.endsWith('.ts')).sort();

const rel = (f: string) => relative(ROOT, f);

/** Все спецификаторы импортов файла — и относительные, и пакетные. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/\bfrom\s+'([^']+)'/g), ...src.matchAll(/\bimport\('([^']+)'\)/g)]
    .map(m => m[1]!);
}

/** Куда указывает относительный импорт, от корня репозитория. */
function targetOf(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(file), spec.replace(/\.js$/, ''));
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(c)) return relative(ROOT, c);
  }
  return relative(ROOT, base);
}

// ── Server-only код недосягаем из браузера ──────────────────────────────────

describe('граница server / client', () => {
  const SERVER_ONLY_PACKAGES = ['firebase-admin', 'firebase-admin/app', 'firebase-admin/auth',
                                'firebase-admin/firestore', 'node:crypto', 'node:http'];

  it('frontend не импортирует server/', () => {
    const leaks = srcFiles.flatMap(f =>
      importsOf(f).map(s => targetOf(f, s)).filter((t): t is string => !!t && t.startsWith('server/'))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });

  it('frontend не импортирует api/', () => {
    const leaks = srcFiles.flatMap(f =>
      importsOf(f).map(s => targetOf(f, s)).filter((t): t is string => !!t && t.startsWith('api/'))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });

  it('frontend не тянет firebase-admin и серверные модули Node', () => {
    const leaks = srcFiles.flatMap(f =>
      importsOf(f).filter(s => SERVER_ONLY_PACKAGES.includes(s)).map(s => `${rel(f)} → ${s}`));
    expect(leaks).toEqual([]);
  });

  it('shared/ изоморфен: ни server/, ни api/, ни firebase-admin', () => {
    const leaks = sharedFiles.flatMap(f => importsOf(f).flatMap(s => {
      if (SERVER_ONLY_PACKAGES.includes(s)) return [`${rel(f)} → ${s}`];
      const t = targetOf(f, s);
      return t && (t.startsWith('server/') || t.startsWith('api/') || t.startsWith('src/'))
        ? [`${rel(f)} → ${t}`] : [];
    }));
    expect(leaks).toEqual([]);
  });

  it('server/ не импортирует frontend', () => {
    const leaks = serverFiles.flatMap(f =>
      importsOf(f).map(s => targetOf(f, s)).filter((t): t is string => !!t && t.startsWith('src/'))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });
});

// ── Слои frontend ───────────────────────────────────────────────────────────

describe('границы внутри src/', () => {
  /** Имя страницы для файла из src/pages/<Page>/..., иначе null. */
  const pageOf = (p: string) => p.startsWith('src/pages/') ? p.split('/')[2] ?? null : null;

  it('страницы не импортируют друг друга — общий код поднимается выше', () => {
    const leaks = srcFiles.flatMap(f => {
      const from = pageOf(rel(f));
      if (!from) return [];
      return importsOf(f).map(sp => targetOf(f, sp))
        .filter((t): t is string => !!t && !!pageOf(t) && pageOf(t) !== from)
        .map(t => `${rel(f)} → ${t}`);
    });
    expect(leaks).toEqual([]);
  });

  it('общий UI не зависит от страниц', () => {
    const leaks = srcFiles.filter(f => rel(f).startsWith('src/components/')).flatMap(f =>
      importsOf(f).map(sp => targetOf(f, sp))
        .filter((t): t is string => !!t && (t.startsWith('src/pages/') || t.startsWith('src/app/')))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });

  it('страницы не импортируют оболочку приложения', () => {
    const leaks = srcFiles.filter(f => rel(f).startsWith('src/pages/')).flatMap(f =>
      importsOf(f).map(sp => targetOf(f, sp))
        .filter((t): t is string => !!t && t.startsWith('src/app/'))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });

  it('сервисы, хуки и утилиты не зависят от UI', () => {
    // Сервис, которому понадобился компонент, — это уже не сервис: его нельзя
    // ни переиспользовать на другой странице, ни протестировать без React.
    const LOWER = ['src/services/', 'src/hooks/', 'src/utils/', 'src/config/', 'src/data/', 'src/constants/'];
    const UI    = ['src/components/', 'src/pages/', 'src/app/'];
    const leaks = srcFiles.filter(f => LOWER.some(d => rel(f).startsWith(d))).flatMap(f =>
      importsOf(f).map(sp => targetOf(f, sp))
        .filter((t): t is string => !!t && UI.some(d => t.startsWith(d)))
        .map(t => `${rel(f)} → ${t}`));
    expect(leaks).toEqual([]);
  });

  it('каждая страница лежит в собственном каталоге src/pages/<Page>/', () => {
    const pages = readdirSync(join(ROOT, 'src/pages'));
    for (const p of pages) {
      expect(statSync(join(ROOT, 'src/pages', p)).isDirectory(), p).toBe(true);
      expect(existsSync(join(ROOT, 'src/pages', p, 'index.ts')), `${p}/index.ts`).toBe(true);
    }
  });
});

describe('стили лежат рядом со своим компонентом', () => {
  const styleFiles = (function walkScss(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walkScss(full, out);
      else if (e.endsWith('.module.scss')) out.push(full);
    }
    return out;
  })(join(ROOT, 'src'));

  it('у каждого *.module.scss есть одноимённый компонент в том же каталоге', () => {
    const orphans = styleFiles
      .filter(f => !existsSync(f.replace(/\.module\.scss$/, '.tsx')))
      .map(rel);
    expect(orphans).toEqual([]);
  });

  it('компонент подключает свой модуль стилей, а не чужой', () => {
    // Импорт стилей из соседнего каталога означает, что компонент опирается на
    // чужую вёрстку: переименуешь класс там — сломается здесь, и молча.
    const leaks = srcFiles.flatMap(f =>
      importsOf(f).filter(sp => sp.endsWith('.module.scss') && sp.includes('/') && !sp.startsWith('./'))
        .map(sp => `${rel(f)} → ${sp}`));
    expect(leaks).toEqual([]);
  });

  it('общие стили лежат в src/styles и подключаются только через @use', () => {
    expect(readdirSync(join(ROOT, 'src/styles')).sort())
      .toEqual(['globals.scss', 'mixins.scss', 'variables.scss']);
  });
});

describe('секреты остаются на сервере', () => {
  // Vite подставляет в бандл только VITE_*-переменные, но упоминание серверного
  // ключа во frontend-коде означает, что его туда собираются передать.
  const SECRETS = ['RESEND_API_KEY', 'FIREBASE_SERVICE_ACCOUNT', 'CRON_SECRET', 'EMAIL_FROM'];

  it('серверные переменные окружения не читаются во frontend и shared', () => {
    // Упоминание имени в комментарии или в подсказке администратору безобидно;
    // утечка — это ЧТЕНИЕ значения через env в коде, который едет в браузер.
    const reads = new RegExp(`(?:process|import\\.meta)\\.env(?:\\.|\\[')(?:VITE_)?(${SECRETS.join('|')})`);
    const leaks = [...srcFiles, ...sharedFiles]
      .filter(f => reads.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(leaks).toEqual([]);
  });

  it('во frontend нет обращений к process.env', () => {
    const leaks = srcFiles.filter(f => readFileSync(f, 'utf8').includes('process.env')).map(rel);
    expect(leaks).toEqual([]);
  });
});

// ── Публичный контракт Vercel ───────────────────────────────────────────────

describe('endpoint-файлы Vercel', () => {
  // Vercel делает endpoint'ом КАЖДЫЙ .ts верхнего уровня api/. Список
  // зафиксирован: переименование файла меняет публичный URL и ломает клиентов.
  const EXPECTED = [
    'cancel-booking.ts', 'checkin-ticket.ts', 'create-booking.ts', 'delete-booking.ts',
    'delete-user.ts', 'expire-bookings.ts', 'register-audience.ts', 'send-email.ts',
    'show-availability.ts',
  ];

  it('набор endpoint-файлов не изменился', () => {
    expect(apiFiles).toEqual(EXPECTED);
  });

  it('внутри api/ нет вложенных каталогов — там были бы лишние endpoint\'ы', () => {
    const dirs = readdirSync(join(ROOT, 'api')).filter(e => statSync(join(ROOT, 'api', e)).isDirectory());
    expect(dirs).toEqual([]);
  });

  it('каждый handler экспортируется по умолчанию', () => {
    for (const f of apiFiles) {
      expect(readFileSync(join(ROOT, 'api', f), 'utf8'), f).toContain('export default async function handler');
    }
  });
});

describe('handler\'ы остаются тонкими', () => {
  // Handler: разобрать запрос → авторизовать → вызвать сервис → ответить.
  // Как только в нём заводится транзакция или запрос к Firestore, правило
  // снова размазывается по HTTP-слою и становится непроверяемым.
  for (const f of apiFiles) {
    it(`${f} не содержит доступа к Firestore напрямую`, () => {
      const src = readFileSync(join(ROOT, 'api', f), 'utf8');
      expect(src, 'транзакция в handler').not.toContain('runTransaction');
      expect(src, 'запрос к Firestore в handler').not.toContain('getFirestore');
      expect(src, 'firebase-admin в handler').not.toMatch(/from 'firebase-admin/);
    });

    it(`${f} укладывается в размер тонкого handler'а`, () => {
      const lines = readFileSync(join(ROOT, 'api', f), 'utf8').split('\n').length;
      expect(lines, `${f}: ${lines} строк`).toBeLessThanOrEqual(80);
    });
  }
});
