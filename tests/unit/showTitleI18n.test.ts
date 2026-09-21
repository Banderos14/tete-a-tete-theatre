// Локализация названия спектакля в билетах, PDF и письмах.
//
// Бронь хранит русское название, французского в ней нет — оно живёт в каталоге
// и находится по showId. Пока локализация была размазана по компонентам,
// французский кабинет показывал «Романтика обреченности» русским текстом.

import { describe, it, expect } from 'vitest';
import { localizedShowTitle } from '../../shared/catalog/showTitle.js';
import { SEASON_CATALOG } from '../../shared/catalog/shows.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';

const ROMANTIKA_RU = SEASON_CATALOG.romantika!.title;
const ROMANTIKA_FR = SEASON_CATALOG.romantika!.titleFR;

describe('localizedShowTitle', () => {
  it('romantika RU → русское название', () => {
    expect(localizedShowTitle({ showId: 'romantika', showTitle: ROMANTIKA_RU }, 'RU'))
      .toBe(ROMANTIKA_RU);
  });

  it('romantika FR → существующее французское название из каталога', () => {
    expect(localizedShowTitle({ showId: 'romantika', showTitle: ROMANTIKA_RU }, 'FR'))
      .toBe(ROMANTIKA_FR);
  });

  it('FR-название не выдумывается: оно взято из каталога, а не собрано в коде', () => {
    // Сторож против «нового перевода»: если кто-то захочет поменять текст,
    // он обязан поменять его в каталоге, а не в компоненте.
    expect(ROMANTIKA_FR).toMatch(/^«.+»$/);
    expect(localizedShowTitle({ showId: 'romantika', showTitle: ROMANTIKA_RU }, 'FR'))
      .not.toBe(ROMANTIKA_RU);
  });

  it('каждый спектакль сезона имеет французское название', () => {
    const missing = Object.entries(SEASON_CATALOG)
      .filter(([, show]) => !show.titleFR.trim())
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it('исторический билет не ломается, если спектакль исчез из каталога', () => {
    const gone = { showId: 'snyatyj-spektakl', showTitle: '«Снятый с афиши»' };
    expect(localizedShowTitle(gone, 'RU')).toBe('«Снятый с афиши»');
    // FR откатывается на снимок брони, а не на пустую строку.
    expect(localizedShowTitle(gone, 'FR')).toBe('«Снятый с афиши»');
  });

  it('FR берёт перевод из ответа API, если showId неизвестен каталогу', () => {
    expect(localizedShowTitle(
      { showId: 'gone', showTitle: 'РУ', showTitleFR: 'FR-титул' }, 'FR',
    )).toBe('FR-титул');
  });

  it('RU сохраняет снимок брони, даже если название в каталоге изменили', () => {
    // Снимок — это то, что напечатано на билете; переписывать его нельзя.
    expect(localizedShowTitle(
      { showId: 'romantika', showTitle: '«Старое название»' }, 'RU',
    )).toBe('«Старое название»');
  });

  it('спектакль без постера тоже переводится по каталогу', () => {
    expect(localizedShowTitle({ showId: 'korablik', showTitle: 'РУ' }, 'FR'))
      .toBe(SEASON_CATALOG.korablik!.titleFR);
  });
});

describe('локализация названия — одна реализация на весь проект', () => {
  const TICKET_SURFACES = [
    'src/components/ui/TicketCard/TicketCard.tsx',
    'src/components/ui/ProfileDrawer/BookingCard.tsx',
    'src/components/ui/ProfileDrawer/AttendedSection.tsx',
    'src/services/ticketPdfService.ts',
    'shared/email/ticketEmail.ts',
  ];

  for (const file of TICKET_SURFACES) {
    it(`${file} локализует название через общий helper`, () => {
      expect(projectSource(file)).toContain('localizedShowTitle');
    });
  }

  it('письма не подставляют сырое showTitle', () => {
    // Именно так во французское письмо и попадал русский заголовок.
    const src = projectSource('shared/email/ticketEmail.ts');
    expect(src).not.toMatch(/\$\{b\.showTitle\}/);
  });

  it('кабинет не рисует b.showTitle напрямую', () => {
    const drawer = screenSource('src/components/ui/ProfileDrawer');
    expect(drawer).not.toContain('{b.showTitle}');
    expect(screenSource('src/components/ui/TicketCard')).not.toContain('{b.showTitle}');
  });

  it('письмо берёт showId из брони — без него FR-перевод не найти', () => {
    expect(projectSource('server/email/ticketEmail.service.ts')).toMatch(/showId:\s+str\(d\.showId\)/);
  });

});
