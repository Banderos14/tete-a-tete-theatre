import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Регрессия: WhatsApp показывал для главной огромное селфи труппы со зрителями
// (og:image → zal-v2.webp), а Google — пустой белый кружок вместо favicon
// (белый логотип на прозрачном фоне). Иконки — официальный знак на прозрачном
// фоне без подложки: чёрный по умолчанию, белый в тёмной теме (favicon.svg).

const ROOT   = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');
const html   = readFileSync(join(ROOT, 'index.html'), 'utf8');

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

// Доля полностью прозрачных пикселей и цвет непрозрачных (все должны быть одного цвета).
function inspect({ pixels }: Rgba) {
  let transparent = 0; const inkColors = new Set<string>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) transparent++;
    else if (pixels[i + 3]! > 200) inkColors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  return { transparentShare: transparent / (pixels.length / 4), cornerAlpha: pixels[3], inkColors: [...inkColors] };
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

describe('favicon — знак на прозрачном фоне', () => {
  const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1]!);

  it('объявлен ровно один набор иконок со стабильными адресами', () => {
    expect(icons).toEqual(['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png']);
  });

  it('каждый файл существует', () => {
    for (const href of icons) expect(existsSync(join(PUBLIC, href)), href).toBe(true);
  });

  it('у ICO явные размеры, а не "any" — иначе Chrome предпочтёт его SVG', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it('favicon.ico: 16/32/48, прозрачный фон, чёрный знак', () => {
    const frames = decodeIco(readFileSync(join(PUBLIC, 'favicon.ico')));
    expect(frames.map(f => f.width).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    for (const frame of frames) {
      expect(frame.height).toBe(frame.width);
      const info = inspect(frame);
      expect(info.cornerAlpha, `${frame.width}px`).toBe(0);
      expect(info.transparentShare, `${frame.width}px`).toBeGreaterThan(0.4);
      expect(info.inkColors, `${frame.width}px`).toEqual(['0,0,0']);
    }
  });

  it('PWA-иконки: квадратные, прозрачный фон, чёрный знак', () => {
    for (const [file, size] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512]] as const) {
      const png = decodePng(readFileSync(join(PUBLIC, file)));
      expect({ w: png.width, h: png.height }, file).toEqual({ w: size, h: size });
      const info = inspect(png);
      expect(info.cornerAlpha, file).toBe(0);
      expect(info.transparentShare, file).toBeGreaterThan(0.4);
      expect(info.inkColors, file).toEqual(['0,0,0']);
    }
  });

  it('apple-touch-icon: прозрачный фон, белый знак (iOS подкладывает чёрный)', () => {
    const png = decodePng(readFileSync(join(PUBLIC, 'apple-touch-icon.png')));
    expect({ w: png.width, h: png.height }).toEqual({ w: 180, h: 180 });
    const info = inspect(png);
    expect(info.cornerAlpha).toBe(0);
    expect(info.transparentShare).toBeGreaterThan(0.4);
    expect(info.inkColors).toEqual(['255,255,255']);
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
