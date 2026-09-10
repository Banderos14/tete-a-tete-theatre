import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSfntFontBinary, isPlausibleFontContentType } from '../../src/utils/fontBinary.js';

const ROOT = resolve(__dirname, '../..');

describe('isSfntFontBinary', () => {
  it('принимает настоящий TTF из проекта', () => {
    const ttf = new Uint8Array(readFileSync(resolve(ROOT, 'public/fonts/ekaterinavelikayatwo.ttf')));
    expect(isSfntFontBinary(ttf)).toBe(true);
  });

  it('ОТКЛОНЯЕТ index.html — ровно то, что отдаёт SPA-rewrite вместо отсутствующего шрифта', () => {
    const html = new TextEncoder().encode(readFileSync(resolve(ROOT, 'index.html'), 'utf8'));
    expect(isSfntFontBinary(html)).toBe(false);
  });

  it('отклоняет woff2: jsPDF умеет только TTF/OTF', () => {
    const woff2 = new Uint8Array(readFileSync(resolve(ROOT, 'public/fonts/Forum.woff2')));
    expect(isSfntFontBinary(woff2)).toBe(false);
  });

  it('отклоняет пустой и обрезанный ввод', () => {
    expect(isSfntFontBinary(new Uint8Array([]))).toBe(false);
    expect(isSfntFontBinary(new Uint8Array([0x00, 0x01]))).toBe(false);
  });

  it('принимает все известные сигнатуры sfnt', () => {
    for (const sig of [[0, 1, 0, 0], [0x74, 0x72, 0x75, 0x65], [0x74, 0x74, 0x63, 0x66], [0x4f, 0x54, 0x54, 0x4f]]) {
      expect(isSfntFontBinary(new Uint8Array([...sig, 0, 0, 0, 0]))).toBe(true);
    }
  });
});

describe('isPlausibleFontContentType', () => {
  it('отклоняет HTML-страницу', () => {
    expect(isPlausibleFontContentType('text/html; charset=utf-8')).toBe(false);
  });
  it('принимает шрифтовые и бинарные типы', () => {
    for (const t of ['font/ttf', 'application/octet-stream', 'application/x-font-ttf']) {
      expect(isPlausibleFontContentType(t)).toBe(true);
    }
  });
  it('отсутствующий заголовок не блокирует — решает сигнатура', () => {
    expect(isPlausibleFontContentType(null)).toBe(true);
  });
});
