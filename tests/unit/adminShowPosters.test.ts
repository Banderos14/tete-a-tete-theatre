// Постеры спектаклей: один источник для всех экранов, включая админку.
//
// Инциденты:
//   • в админке у «Крошки Енота», «Красной Шапочки» и «Летучего корабля» стояли
//     инициалы — у первых двух в каталоге не было поля image, хотя файлы уже
//     появились; у «Летучего корабля» официального постера нет до сих пор;
//   • «Счастливая любовь» на проде показывала старую афишу (с датой «21 марта»):
//     файл заменили в public/images/shows/ под тем же именем, а /images/*
//     отдаётся с `immutable` на год, и CDN продолжал раздавать старую версию.
//     Теперь постеры импортируются через Vite и получают content-hash в имени.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SHOWS, REPERTOIRE } from '../../src/data/shows';
import { AdminShowCard } from '../../src/pages/AdminPage/AdminShowCard';
import { showGlyph, summarizeByShow } from '../../src/pages/AdminPage/adminStats';
import { projectSource } from '../helpers/serverSource.js';
import type { Show } from '../../src/types';

const ROOT = resolve(__dirname, '../..');

const byId = (id: string): Show => {
  const show = SHOWS.find(s => s.id === id);
  if (!show) throw new Error(`нет спектакля ${id} в каталоге`);
  return show;
};

const renderCard = (show: Show) =>
  renderToStaticMarkup(createElement(AdminShowCard, {
    stats: summarizeByShow([show], [])[0]!,
    active: false,
    onToggle: () => {},
  }));

const imgSrcs = (html: string) => [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1]);

/** Путь импортированного ассета → файл на диске (в тестах Vite отдаёт /src/...). */
const assetFile = (url: string) => resolve(ROOT, url.replace(/^\//, ''));

const md5 = (file: string) => createHash('md5').update(readFileSync(file)).digest('hex');

// Старая афиша «Счастливой любви» с датой «21 марта 19:00» — её раздавал прод.
const OLD_LUBOV_POSTER_MD5 = 'd27b0a2d0a1ce5a26cd0b652cdcc4f6c';

describe('админка берёт постер из каталога спектаклей', () => {
  it('спектакль с постером → в карточке его изображение, а не инициалы', () => {
    for (const id of ['romantika', 'shutka', 'lubov', 'enot', 'shapochka', 'kovcheg']) {
      const show = byId(id);
      const html = renderCard(show);
      expect(show.image, id).toBeTruthy();
      expect(imgSrcs(html), id).toEqual([show.image]);
      expect(html, id).not.toContain(`>${showGlyph(show.title)}<`);
    }
  });

  it('миниатюра не растягивается, грузится лениво и не дублирует название для скринридера', () => {
    const html = renderCard(byId('lubov'));
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
    // Название спектакля — текстом в той же кнопке.
    expect(html).toContain('«Счастливая любовь»');

    const scss = projectSource('src/pages/AdminPage/AdminPage.module.scss');
    const img  = /\.showCardImg\s*\{([^}]*)\}/.exec(scss)?.[1] ?? '';
    expect(img).toMatch(/object-fit:\s*cover/);
    expect(img).toMatch(/width:\s*40px/);
    expect(img).toMatch(/height:\s*40px/);
  });

  it('спектакль без постера → инициалы, и никакой чужой фотографии', () => {
    const letuchiy = byId('letuchiy');
    expect(letuchiy.image).toBeUndefined();

    const html = renderCard(letuchiy);
    expect(imgSrcs(html)).toEqual([]);
    expect(html).toContain('>ЛК<');
    expect(html).toContain('aria-hidden="true"');
  });

  it('у админки нет своей таблицы картинок и своего списка спектаклей', () => {
    const admin = ['BookingsTab.tsx', 'AdminShowCard.tsx', 'adminStats.ts']
      .map(f => projectSource(`src/pages/AdminPage/${f}`)).join('\n');
    expect(admin).not.toMatch(/\.webp|\.jpe?g|\.png/);
    expect(admin).toContain('show.image');
    expect(projectSource('src/pages/AdminPage/BookingsTab.tsx')).toContain("import { SHOWS } from '../../data/shows'");
  });
});

describe('один постер на спектакль во всех экранах', () => {
  it('SHOWS и REPERTOIRE ссылаются на один и тот же файл', () => {
    for (const show of SHOWS) {
      const rep = REPERTOIRE.find(r => r.id === show.id);
      if (!rep) continue;
      expect(rep.image, show.id).toBe(show.image);
    }
  });

  it('у разных спектаклей разные постеры — чужое фото не подставляется', () => {
    const images = SHOWS.map(s => s.image).filter(Boolean);
    expect(new Set(images).size).toBe(images.length);
  });

  it('каждый постер существует на диске', () => {
    for (const show of SHOWS.filter(s => s.image)) {
      expect(existsSync(assetFile(show.image!)), `${show.id}: ${show.image}`).toBe(true);
    }
  });

  it('Счастливая любовь → актуальная афиша, а не старая с датой «21 марта»', () => {
    const lubov = byId('lubov');
    expect(lubov.image).toMatch(/src\/assets\/shows\/lubov\.webp$/);
    expect(md5(assetFile(lubov.image!))).not.toBe(OLD_LUBOV_POSTER_MD5);
    expect(REPERTOIRE.find(r => r.id === 'lubov')!.image).toBe(lubov.image);
  });
});

describe('постеры не лежат под неизменяемым URL', () => {
  it('в public/ нет каталога постеров — только импорт через Vite с content-hash', () => {
    expect(existsSync(resolve(ROOT, 'public/images/shows'))).toBe(false);

    const src = projectSource('src/data/shows.ts');
    const imports = [...src.matchAll(/^import \w+Poster\s+from '\.\.\/assets\/shows\/([\w-]+\.webp)';$/gm)].map(m => m[1]);
    expect(imports.sort()).toEqual(readdirSync(resolve(ROOT, 'src/assets/shows')).sort());
    expect(src).not.toContain('images/shows/');
  });
});
