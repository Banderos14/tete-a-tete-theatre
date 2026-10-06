// Бегущая строка: ближайшие спектакли из каталога, без дат вручную.
//
// Спектакли — из того же списка, что у Афиши (afishaShows), поэтому прошедший
// исчезает сам. «Бронирование открыто» в ограниченном режиме продаж не пишется.

import { describe, it, expect } from 'vitest';
import { marqueeItems, marqueeShowItems, MARQUEE_MAX_SHOWS } from '../../src/pages/HomePage/sections/Marquee/marqueeItems';
import { afishaShows } from '../../src/data/shows';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { projectSource } from '../helpers/serverSource.js';

const ms = (iso: string) => new Date(iso).getTime();
const OCT_6 = ms('2026-10-06T12:00:00Z');

describe('бегущая строка', () => {
  it('6 октября: только предстоящие, по ближайшей дате, RU', () => {
    expect(marqueeShowItems(OCT_6, 'RU')).toEqual([
      '16.10 · «Разговор, которого не было»',
      '18.10 · «Крошка Енот»',
      '14.11 · «Счастливая любовь»',
      '15.11 · «Красная Шапочка»',
      '28.11 · «У ковчега в восемь»',
    ]);
  });

  it('FR — французские названия', () => {
    expect(marqueeShowItems(OCT_6, 'FR')).toContain('18.10 · «Le Petit Raton laveur»');
    expect(marqueeShowItems(OCT_6, 'FR')).toContain('15.11 · «Le Petit Chaperon rouge»');
  });

  it('прошедшие спектакли исчезают сами — по моменту начала', () => {
    const items = marqueeShowItems(OCT_6, 'RU').join(' ');
    expect(items).not.toMatch(/17\.09|02\.10|04\.10|Романтика|шутку|кораблика/);
    // «Разговор» 16.10 в 20:00 Парижа = 18:00 UTC.
    expect(marqueeShowItems(ms('2026-10-16T17:59:00Z'), 'RU')[0]).toContain('Разговор');
    expect(marqueeShowItems(ms('2026-10-16T18:00:00Z'), 'RU')[0]).toContain('Крошка Енот');
  });

  it('тот же список, что у Афиши, и не больше лимита', () => {
    const now = ms('2026-09-01T00:00:00Z');
    expect(marqueeShowItems(now, 'RU')).toHaveLength(Math.min(afishaShows(now).length, MARQUEE_MAX_SHOWS));
    expect(projectSource('src/pages/HomePage/sections/Marquee/marqueeItems.ts')).toContain('afishaShows(nowMs)');
  });

  it('после сезона — только постоянный хвост', () => {
    expect(marqueeItems({ nowMs: ms('2027-01-01T00:00:00Z'), lang: 'RU', tail: RU.marquee, bookingOpen: null }))
      .toEqual(['Сезон 2026/2027', 'Nice · Rue Rossini']);
  });

  it('в i18n нет дат и названий спектаклей — только хвост', () => {
    expect(RU.marquee).toEqual(['Сезон 2026/2027', 'Nice · Rue Rossini']);
    expect(FR.marquee).toEqual(['Saison 2026/2027', 'Nice · Rue Rossini']);
  });

  it('«Бронирование открыто» — только в обычном режиме продаж', () => {
    const limited = marqueeItems({ nowMs: OCT_6, lang: 'RU', tail: RU.marquee, bookingOpen: null });
    expect(limited).not.toContain(RU.marqueeBookingOpen);
    const normal = marqueeItems({ nowMs: OCT_6, lang: 'RU', tail: RU.marquee, bookingOpen: RU.marqueeBookingOpen });
    expect(normal.at(-1)).toBe('Бронирование открыто');
    expect(projectSource('src/pages/HomePage/sections/Marquee/Marquee.tsx'))
      .toContain('bookingOpen: isLimitedSalesMode() ? null : t.marqueeBookingOpen,');
  });
});
