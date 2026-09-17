import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Регрессия: WhatsApp показывал для главной огромное селфи труппы со зрителями
// (og:image → zal-v2.webp), а Google — пустой белый кружок вместо favicon
// (белый логотип на прозрачном фоне).

const ROOT   = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const html   = readFileSync(join(ROOT, 'index.html'), 'utf8');

const meta = (attr: 'property' | 'name', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

// Размеры PNG лежат в заголовке IHDR — сторонняя библиотека не нужна.
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('превью главной в мессенджерах — без большой фотографии', () => {
  it('нет og:image и twitter:image', () => {
    expect(html).not.toMatch(/<meta[^>]+og:image/);
    expect(html).not.toMatch(/<meta[^>]+twitter:image/);
  });

  it('twitter:card — компактная карточка', () => {
    expect(meta('name', 'twitter:card')).toBe('summary');
  });

  it('базовые OG-поля на месте', () => {
    expect(meta('property', 'og:title')).toBe('Théâtre Tête-à-Tête à Nice');
    expect(meta('property', 'og:site_name')).toBe('Théâtre Tête-à-Tête');
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:url')).toBe('https://www.theatre-teteatete.fr/');
    expect(meta('property', 'og:description')).toBeTruthy();
  });

  it('canonical не изменился', () => {
    expect(html).toContain('<link rel="canonical" href="https://www.theatre-teteatete.fr/" />');
  });
});

describe('favicon', () => {
  const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1]!);

  it('объявлен ровно один набор иконок со стабильными адресами', () => {
    expect(icons).toEqual([
      '/favicon.ico',
      '/favicon-48x48.png',
      '/favicon-32x32.png',
      '/favicon-16x16.png',
      '/apple-touch-icon.png',
    ]);
  });

  it('каждый файл существует', () => {
    for (const href of icons) expect(existsSync(join(PUBLIC, href)), href).toBe(true);
  });

  it('PNG-иконки квадратные и совпадают с объявленным sizes', () => {
    for (const [file, size] of [
      ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['favicon-48x48.png', 48],
      ['apple-touch-icon.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512],
    ] as const) {
      expect(pngSize(join(PUBLIC, file)), file).toEqual({ width: size, height: size });
    }
  });

  it('устаревшего белого SVG-favicon больше нет', () => {
    expect(existsSync(join(PUBLIC, 'favicon.svg'))).toBe(false);
  });

  it('логотип в JSON-LD читается на белом фоне (не белая версия)', () => {
    expect(html).toContain('"logo": "https://www.theatre-teteatete.fr/images/favicon-source.png"');
    expect(existsSync(join(PUBLIC, 'images/favicon-source.png'))).toBe(true);
  });
});
