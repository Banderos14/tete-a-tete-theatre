// Чтение исходников серверного слоя для тестов-«сторожей».
//
// Handler'ы в api/ намеренно тонкие: разбор запроса, авторизация, вызов
// сервиса, ответ. Сама логика живёт в server/ и shared/. Тест про поведение
// endpoint'а должен смотреть на весь его граф локальных импортов, иначе он
// начинает проверять не правило, а место, где это правило записано сегодня.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

// Относительный импорт из ESM-кода: './x.js', '../server/y.js'.
const RELATIVE_IMPORT_RE = /\bfrom\s+'(\.[^']+)'/g;

function resolveLocal(fromFile: string, spec: string): string | null {
  // Мы пишем ESM-импорты с расширением .js, а на диске лежит .ts.
  const base = join(dirname(fromFile), spec.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Исходник endpoint'а вместе со всем его серверным слоем: handler плюс всё,
 * что он импортирует относительными путями, транзитивно. Путь задаётся от
 * корня репозитория, например 'api/checkin-ticket.ts'.
 */
export function endpointSource(entry: string): string {
  const seen  = new Set<string>();
  const parts: string[] = [];

  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);

    const src = readFileSync(file, 'utf8');
    parts.push(src);

    for (const [, spec] of src.matchAll(RELATIVE_IMPORT_RE)) {
      const target = resolveLocal(file, spec);
      if (target) visit(target);
    }
  };

  visit(resolve(ROOT, entry));
  return parts.join('\n');
}

/** Исходник одного файла проекта по пути от корня репозитория. */
export function projectSource(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/**
 * Тело вызова `runTransaction(...)` целиком — по балансу скобок, а не по
 * поиску следующего `catch`. Нужно тестам, которые проверяют, что чтение и
 * запись происходят внутри ОДНОЙ транзакции.
 */
export function transactionBody(src: string, from = 0): string {
  const call = src.indexOf('runTransaction', from);
  if (call === -1) return '';

  const open = src.indexOf('(', call);
  if (open === -1) return '';

  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(call, i + 1);
    }
  }
  return src.slice(call);
}

/**
 * Тело функции вместе с сигнатурой — по балансу скобок. Параметры могут
 * содержать литеральный тип с фигурными скобками, поэтому список параметров
 * сначала пропускается по балансу круглых.
 */
export function functionBody(src: string, name: string): string {
  const decl = src.indexOf(`function ${name}`);
  if (decl === -1) return '';

  const open = src.indexOf('(', decl);
  if (open === -1) return '';

  let parens = 0;
  let afterParams = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')') {
      parens--;
      if (parens === 0) { afterParams = i + 1; break; }
    }
  }
  if (afterParams === -1) return '';

  const bodyStart = src.indexOf('{', afterParams);
  if (bodyStart === -1) return '';

  let braces = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') braces++;
    else if (src[i] === '}') {
      braces--;
      if (braces === 0) return src.slice(decl, i + 1);
    }
  }
  return src.slice(decl);
}

/**
 * Все исходники экрана одним текстом.
 *
 * Нужен тестам, которые проверяют правило («экран проверки билетов шлёт письмо
 * об оплате»), а не адрес файла: после разбиения страницы на оболочку, хуки и
 * карточки правило остаётся тем же, а конкретный файл может смениться.
 */
export function screenSource(dir: string): string {
  const full = resolve(ROOT, dir);
  return readdirSync(full)
    .filter(f => /\.tsx?$/.test(f))
    .sort()
    .map(f => readFileSync(resolve(full, f), 'utf8'))
    .join('\n');
}
