import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Регрессия: WhatsApp и Telegram показывали для главной огромное селфи труппы со
// зрителями (сначала og:image, затем "image" в JSON-LD → zal-v2.webp), а Google —
// пустой белый кружок вместо favicon (белый apple-touch-icon на прозрачном фоне)
// и домен вместо имени сайта (не было WebSite в структурированных данных).
// Иконки — официальный знак на прозрачном фоне без подложки, контраст дан контуром.

const ROOT   = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const html   = readFileSync(join(ROOT, 'index.html'), 'utf8');

const OLD_PHOTO = 'zal-v2.webp';
const SITE_NAME = 'Théâtre Tête-à-Tête';
const HOME      = 'https://www.theatre-teteatete.fr/';

const meta = (attr: 'property' | 'name', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

interface Rgba { width: number; height: number; pixels: Buffer }

// Минимальный декодер PNG (8 бит RGBA, без interlace) — ровно то, что пишет генератор иконок.
function decodePng(buf: Buffer): Rgba {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  expect({ bitDepth: buf[24], colorType: buf[25], interlace: buf[28] })
    .toEqual({ bitDepth: 8, colorType: 6, interlace: 0 });

  const idat: Buffer[] = [];
  for (let pos = 8; pos < buf.length;) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? pixels[y * stride + x - bpp]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]!;
      pixels[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, pixels };
}

// ICO от Pillow хранит каждый размер как вложенный PNG.
function decodeIco(buf: Buffer): Rgba[] {
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const entry = 6 + i * 16;
    const size = buf.readUInt32LE(entry + 8), offset = buf.readUInt32LE(entry + 12);
    return decodePng(buf.subarray(offset, offset + size));
  });
}

// Доля полностью прозрачных пикселей и доли тёмных / светлых непрозрачных пикселей.
function inspect({ pixels }: Rgba) {
  let transparent = 0, opaque = 0, dark = 0, light = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) { transparent++; continue; }
    if (pixels[i + 3]! < 200) continue;
    opaque++;
    const lum = (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3;
    if (lum < 60) dark++; else if (lum > 195) light++;
  }
  return {
    transparentShare: transparent / (pixels.length / 4),
    cornerAlpha: pixels[3],
    darkShare: dark / opaque,
    lightShare: light / opaque,
  };
}

// Иконка без собственного фона должна читаться и на белом, и на тёмном: у неё есть
// и заметная тёмная часть (видна на белом), и заметная светлая (видна на тёмном).
function expectReadableOnLightAndDark(frame: Rgba, label: string) {
  const info = inspect(frame);
  expect(info.cornerAlpha, label).toBe(0);
  expect(info.transparentShare, label).toBeGreaterThan(0.2);
  expect(info.darkShare, label).toBeGreaterThan(0.15);
  expect(info.lightShare, label).toBeGreaterThan(0.15);
}

const jsonLdNodes = (): Record<string, unknown>[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap(m => {
      const data = JSON.parse(m[1]!) as Record<string, unknown>;
      return (data['@graph'] as Record<string, unknown>[] | undefined) ?? [data];
    });

describe('превью главной в мессенджерах — без большой фотографии', () => {
  it('нет og:image и twitter:image', () => {
    expect(html).not.toMatch(/<meta[^>]+og:image/);
    expect(html).not.toMatch(/<meta[^>]+twitter:image/);
  });

  it(`старая фотография ${OLD_PHOTO} не используется ни в мета-тегах, ни в JSON-LD`, () => {
    for (const tag of html.match(/<meta[^>]*>/g) ?? []) expect(tag).not.toContain(OLD_PHOTO);
    for (const node of jsonLdNodes()) expect(JSON.stringify(node)).not.toContain(OLD_PHOTO);
    // и нигде больше в <head> (кроме комментариев), откуда краулер мог бы взять картинку
    const head = html.slice(0, html.indexOf('</head>')).replace(/<!--[\s\S]*?-->/g, '');
    expect(head).not.toMatch(/zal-v2|\.webp"/);
  });

  it('в JSON-LD нет "image" — мессенджеры берут его как картинку превью', () => {
    for (const node of jsonLdNodes()) expect(node).not.toHaveProperty('image');
  });

  it('twitter:card — компактная карточка', () => {
    expect(meta('name', 'twitter:card')).toBe('summary');
  });

  it('базовые OG-поля на месте', () => {
    expect(meta('property', 'og:title')).toBe(SITE_NAME);
    expect(meta('property', 'og:site_name')).toBe(SITE_NAME);
    expect(meta('name', 'twitter:title')).toBe(SITE_NAME);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:url')).toBe(HOME);
    expect(meta('property', 'og:description')).toBeTruthy();
  });

  it('canonical и <title> не изменились', () => {
    expect(html).toContain('<link rel="canonical" href="https://www.theatre-teteatete.fr/" />');
    expect(html).toContain('<title>Théâtre Tête-à-Tête à Nice — Spectacles en russe et billetterie</title>');
  });
});

describe('имя сайта для Google — WebSite в структурированных данных', () => {
  it('ровно один узел WebSite с предпочтительным именем', () => {
    const sites = jsonLdNodes().filter(n => n['@type'] === 'WebSite');
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      name: SITE_NAME,
      alternateName: ['Tête-à-Tête', 'Театр Тет-а-Тет'],
      url: HOME,
    });
  });

  it('театр назван так же, как сайт и og:site_name, и не дублируется', () => {
    const theatres = jsonLdNodes().filter(n => n['@type'] === 'PerformingArtsTheater');
    expect(theatres).toHaveLength(1);
    expect(theatres[0]).toMatchObject({ name: SITE_NAME, url: HOME });
    expect(jsonLdNodes().every(n => n['name'] === SITE_NAME)).toBe(true);
  });
});

describe('favicon — знак на прозрачном фоне, читается на светлом и тёмном', () => {
  const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1]!);

  it('объявлен ровно один набор иконок со стабильными адресами', () => {
    expect(icons).toEqual(['/favicon-96x96.png', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png']);
  });

  it('каждый файл существует', () => {
    for (const href of icons) expect(existsSync(join(PUBLIC, href)), href).toBe(true);
  });

  it('растровый PNG объявлен первым; у ICO явные размеры, а не "any"', () => {
    expect(html).toContain('<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />');
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it('favicon-96x96.png: квадрат 96px (кратно 48 — рекомендация Google)', () => {
    const png = decodePng(readFileSync(join(PUBLIC, 'favicon-96x96.png')));
    expect({ w: png.width, h: png.height }).toEqual({ w: 96, h: 96 });
    expectReadableOnLightAndDark(png, 'favicon-96x96.png');
  });

  it('favicon.ico: 16/32/48, тот же знак с контуром', () => {
    const frames = decodeIco(readFileSync(join(PUBLIC, 'favicon.ico')));
    expect(frames.map(f => f.width).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    for (const frame of frames) {
      expect(frame.height).toBe(frame.width);
      if (frame.width >= 32) expectReadableOnLightAndDark(frame, `${frame.width}px`);
    }
  });

  it('PWA-иконки: квадратные, прозрачный фон, чёрный знак', () => {
    for (const [file, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512]] as const) {
      const png = decodePng(readFileSync(join(PUBLIC, file)));
      expect({ w: png.width, h: png.height }, file).toEqual({ w: size, h: size });
      const info = inspect(png);
      expect(info.cornerAlpha, file).toBe(0);
      expect(info.transparentShare, file).toBeGreaterThan(0.4);
      expect(info.darkShare, file).toBeGreaterThan(0.9);
    }
  });

  it('apple-touch-icon: белый знак (iOS подкладывает чёрный) с тёмным контуром — не пустой на белом', () => {
    const png = decodePng(readFileSync(join(PUBLIC, 'apple-touch-icon.png')));
    expect({ w: png.width, h: png.height }).toEqual({ w: 180, h: 180 });
    expectReadableOnLightAndDark(png, 'apple-touch-icon.png');
  });

  it('favicon.svg: без фона, цвет знака зависит от темы', () => {
    const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
    expect(svg).toContain('prefers-color-scheme:dark');
    expect(svg).toMatch(/rect\{fill:#000\}/);
    expect(svg).toMatch(/rect\{fill:#fff\}/);
    expect(svg).toContain('mask="url(#glyph)"');
    // единственный rect — залитый знак под маской, отдельной подложки нет
    expect(svg.match(/<rect/g)).toHaveLength(1);
  });

  it('PWA-иконки не объявлены maskable — у maskable фон должен быть непрозрачным', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, 'site.webmanifest'), 'utf8')) as { icons: { purpose: string }[] };
    expect(manifest.icons.map(i => i.purpose)).toEqual(['any', 'any']);
  });

  it('логотип в JSON-LD читается на белом фоне (не белая версия)', () => {
    expect(html).toContain('"logo": "https://www.theatre-teteatete.fr/images/favicon-source.png"');
    expect(existsSync(join(PUBLIC, 'images/favicon-source.png'))).toBe(true);
  });
});
