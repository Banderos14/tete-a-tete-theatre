import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Регрессия: WhatsApp и Telegram показывали для главной огромное селфи труппы со
// зрителями (сначала og:image, затем "image" в JSON-LD → zal-v2.webp), а Google —
// пустой белый кружок вместо favicon (белый apple-touch-icon на прозрачном фоне)
// и домен вместо имени сайта (не было WebSite в структурированных данных).
// Прозрачный знак с белыми частями в круге выдачи тоже читался плохо, поэтому
// иконки — тёмный официальный знак на непрозрачном белом квадрате.

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

// Иконка для выдачи Google и вкладок: непрозрачная (углы белые, прозрачных
// пикселей нет), фон светлый, знак тёмный и занимает заметную часть квадрата.
function expectDarkMarkOnWhite(frame: Rgba, label: string, minDark = 0.12) {
  const info = inspect(frame);
  expect(info.transparentShare, label).toBe(0);
  const corner = [...frame.pixels.subarray(0, 4)];
  expect(corner, label).toEqual([255, 255, 255, 255]);
  expect(info.lightShare, label).toBeGreaterThan(0.4);
  expect(info.darkShare, label).toBeGreaterThan(minDark);
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

describe('favicon — тёмный знак на белом квадрате, читается в выдаче Google', () => {
  const icons = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1]!);

  it('объявлен ровно один набор иконок со стабильными адресами', () => {
    expect(icons).toEqual(['/favicon-96x96.png', '/favicon-48x48.png', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png']);
  });

  it('каждый файл существует', () => {
    for (const href of icons) expect(existsSync(join(PUBLIC, href)), href).toBe(true);
  });

  it('растровый PNG объявлен первым; у ICO явные размеры, а не "any"', () => {
    expect(html).toContain('<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />');
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it('PNG-иконки для Google: квадраты кратно 48px, тёмный знак на белом', () => {
    for (const [file, size] of [['favicon-96x96.png', 96], ['favicon-48x48.png', 48]] as const) {
      const png = decodePng(readFileSync(join(PUBLIC, file)));
      expect({ w: png.width, h: png.height }, file).toEqual({ w: size, h: size });
      // На 48px тонкие линии знака сглаживаются в серый — порог ниже.
      expectDarkMarkOnWhite(png, file, size === 48 ? 0.08 : 0.12);
    }
  });

  it('favicon.ico: 16/32/48, тот же непрозрачный знак', () => {
    const frames = decodeIco(readFileSync(join(PUBLIC, 'favicon.ico')));
    expect(frames.map(f => f.width).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    for (const frame of frames) {
      expect(frame.height).toBe(frame.width);
      expectDarkMarkOnWhite(frame, `${frame.width}px`, 0.08);
    }
  });

  it('apple-touch-icon и PWA-иконки: тот же знак на белом, с полями', () => {
    for (const [file, size] of [['apple-touch-icon.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512]] as const) {
      const png = decodePng(readFileSync(join(PUBLIC, file)));
      expect({ w: png.width, h: png.height }, file).toEqual({ w: size, h: size });
      expectDarkMarkOnWhite(png, file, 0.08);
    }
  });

  it('favicon.svg: белая подложка в самой картинке, без переключения на белый знак в тёмной теме', () => {
    const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
    expect(svg).not.toContain('prefers-color-scheme');
    expect(svg).not.toMatch(/fill:#fff/);
    const png = decodePng(Buffer.from(svg.match(/base64,([A-Za-z0-9+/=]+)/)![1]!, 'base64'));
    expectDarkMarkOnWhite(png, 'favicon.svg');
  });

  it('PWA-иконки объявлены как "any" (не maskable)', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, 'site.webmanifest'), 'utf8')) as { icons: { purpose: string }[] };
    expect(manifest.icons.map(i => i.purpose)).toEqual(['any', 'any']);
  });

  it('логотип в JSON-LD — непрозрачный знак на белом (хорошо смотрится на белом фоне)', () => {
    expect(html).toContain('"logo": "https://www.theatre-teteatete.fr/icons/icon-512.png"');
  });
});

describe('техническое SEO: один адрес сайта везде', () => {
  const robots  = readFileSync(join(PUBLIC, 'robots.txt'), 'utf8');
  const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');

  it('canonical, og:url, WebSite.url и sitemap указывают на https://www. с косой чертой', () => {
    expect(html).toContain(`<link rel="canonical" href="${HOME}" />`);
    expect(meta('property', 'og:url')).toBe(HOME);
    for (const node of jsonLdNodes()) expect(node['url']).toBe(HOME);
    expect(sitemap).toContain(`<loc>${HOME}</loc>`);
    expect(robots).toContain('Sitemap: https://www.theatre-teteatete.fr/sitemap.xml');
  });

  it('нет случайного noindex и запрета обхода', () => {
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
    expect(robots).toMatch(/User-agent: \*\s*\nAllow: \//);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
  });

  it('узлы JSON-LD связаны: WebSite издаётся театром', () => {
    const site = jsonLdNodes().find(n => n['@type'] === 'WebSite')!;
    const theatre = jsonLdNodes().find(n => n['@type'] === 'PerformingArtsTheater')!;
    expect(site['publisher']).toEqual({ '@id': theatre['@id'] });
    expect(theatre['alternateName']).toEqual(site['alternateName']);
  });

  it('в <head> нет staging- и preview-адресов', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).not.toMatch(/vercel\.app|staging|localhost/);
  });
});
