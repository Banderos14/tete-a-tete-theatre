// Афиша = только предстоящие спектакли, Репертуар = все постановки.
//
// Прошедший спектакль исчезает из Афиши сам — по дате и времени каталога
// (настенное время Europe/Paris, та же функция, что у сервера), — но остаётся
// в каталоге, в Репертуаре и в админке. Будущий спектакль, продажи которого
// закрыты ограниченным режимом (shared/catalog/salesMode.ts), в Афише остаётся
// с неактивной покупкой. «Спектакль прошёл» и «временно недоступно» — разные
// состояния.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PUBLISHED_SHOWS, PUBLISHED_REPERTOIRE, afishaShows, isShowUpcoming, isShowPast,
} from '../../src/data/shows';
import { isShowBookingEnabled, isShowSalesPaused } from '../../shared/catalog/salesMode';
import { LangContext } from '../../src/i18n/LangContext';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { AfishaSlider } from '../../src/pages/HomePage/sections/Afisha/AfishaSlider';
import { projectSource } from '../helpers/serverSource.js';

const ms = (iso: string) => new Date(iso).getTime();
const ids = (nowMs: number) => afishaShows(nowMs).map(s => s.id);

// 6 октября 2026: прошли «Романтика» (17.09), «И в шутку» (02.10), «Кораблик» (04.10).
const OCT_6 = ms('2026-10-06T12:00:00Z');

function renderAfisha(nowIso: string, lang: 'RU' | 'FR' = 'RU'): string {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(nowIso));
  return renderToStaticMarkup(createElement(
    LangContext.Provider, { value: { lang, t: lang === 'FR' ? FR : RU } },
    createElement(AfishaSlider, { onCardClick: () => {} }),
  ));
}

afterEach(() => { vi.useRealTimers(); });

describe('Афиша: только предстоящие спектакли', () => {
  it('будущий спектакль есть в Афише', () => {
    expect(ids(OCT_6)).toEqual(expect.arrayContaining(['razgovor', 'enot', 'lubov', 'shapochka', 'kovcheg']));
  });

  it('прошедший спектакль в Афише не показывается', () => {
    for (const id of ['romantika', 'shutka', 'korablik']) expect(ids(OCT_6), id).not.toContain(id);
  });

  it('граница — момент начала по времени Парижа, а не дата', () => {
    // «Крошка Енот»: 18 Окт 2026, 10:00 Europe/Paris = 08:00 UTC (летнее время).
    expect(ids(ms('2026-10-18T07:59:00Z'))).toContain('enot');
    expect(ids(ms('2026-10-18T08:00:00Z'))).not.toContain('enot');
    // «У ковчега в восемь»: 28 Ноя 2026, 19:00 Europe/Paris = 18:00 UTC (зимнее время).
    expect(ids(ms('2026-11-28T17:59:00Z'))).toContain('kovcheg');
    expect(ids(ms('2026-11-28T18:00:00Z'))).not.toContain('kovcheg');
  });

  it('isShowUpcoming — ровно противоположность isShowPast', () => {
    for (const show of PUBLISHED_SHOWS) {
      expect(isShowUpcoming(show, OCT_6), show.id).toBe(!isShowPast(show, OCT_6));
    }
  });

  it('фильтр по дате не трогает каталог: опубликованные спектакли на месте', () => {
    expect(PUBLISHED_SHOWS.map(s => s.id)).toEqual(
      expect.arrayContaining(['romantika', 'shutka', 'korablik', 'razgovor', 'enot', 'lubov', 'shapochka', 'kovcheg']),
    );
    // Заготовка в Афишу не попадает и в будущем.
    expect(ids(OCT_6)).not.toContain('letuchiy');
  });

  it('после последнего спектакля сезона Афиша пуста — и показывает строку, а не пустую ленту', () => {
    expect(ids(ms('2027-01-01T00:00:00Z'))).toEqual([]);
    expect(renderAfisha('2027-01-01T00:00:00Z')).toContain(RU.afisha.empty);
    expect(renderAfisha('2027-01-01T00:00:00Z', 'FR')).toContain(FR.afisha.empty);
  });
});

describe('Репертуар: прошедшие постановки остаются', () => {
  it('прошедший спектакль есть в Репертуаре', () => {
    const rep = PUBLISHED_REPERTOIRE.map(r => r.id);
    for (const id of ['romantika', 'shutka', 'korablik', 'nulin']) expect(rep, id).toContain(id);
  });

  it('Репертуар не фильтруется по дате', () => {
    const src = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    expect(src).toContain('PUBLISHED_REPERTOIRE.map(');
    expect(src).not.toContain('afishaShows');
  });
});

describe('ограниченный режим продаж в Афише', () => {
  it('будущий закрытый спектакль есть в Афише, но бронирование выключено', () => {
    for (const id of ['razgovor', 'lubov', 'kovcheg']) {
      expect(ids(OCT_6), id).toContain(id);
      expect(isShowBookingEnabled(id), id).toBe(false);
    }
  });

  it('спектакли из allowlist бронируются', () => {
    for (const id of ['enot', 'shapochka']) {
      expect(ids(OCT_6), id).toContain(id);
      expect(isShowBookingEnabled(id), id).toBe(true);
    }
  });

  it('прямой вызов API на закрытый спектакль по-прежнему отклоняется — см. tests/unit/salesMode.test.ts', () => {
    const service = projectSource('server/booking/booking.service.ts');
    expect(service).toContain('if (!isShowBookingEnabled(showId)) {');
    expect(service).toContain('BOOKING_TEMPORARILY_UNAVAILABLE');
  });

  it('карточки: статус «приостановлено» только у закрытых будущих, у разрешённых — нет', () => {
    const html = renderAfisha('2026-10-06T12:00:00Z');
    // Енот + Шапочка открыты, Разговор + Любовь + Ковчег закрыты; прошедших нет.
    const paused = html.split(RU.sales.pausedStatus).length - 1;
    const cards  = html.split('data-show-idx=').length - 1;
    expect(cards).toBeGreaterThan(0);
    expect(cards % 5).toBe(0);
    expect(paused).toBe((cards / 5) * 3);
    expect(html).not.toContain('Романтика обреченности');
    expect(html).toContain('Крошка Енот');
    expect(renderAfisha('2026-10-06T12:00:00Z', 'FR')).toContain(FR.sales.pausedStatus);
  });
});

describe('прошедший спектакль не выдаётся за «временно недоступный»', () => {
  it('сам признак режима о дате не знает — разделение делают экраны', () => {
    // «Романтика» уже прошла и при этом не в allowlist: помечать её «приостановлено» нельзя.
    expect(isShowSalesPaused('romantika')).toBe(true);
    expect(isShowPast(PUBLISHED_SHOWS.find(s => s.id === 'romantika')!, OCT_6)).toBe(true);
  });

  it('модалка спектакля: сначала «уже прошёл», «временно недоступно» — только для будущих', () => {
    const modal = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    expect(modal).toContain('const salesPaused = !!show && !showIsPast && isShowSalesPaused(show.id);');
    expect(modal).toMatch(/\) : showIsPast \? \(\s*\/\/[^\n]*\n[^\n]*\n\s*<button type="button" className=\{styles\.pausedBtn\} disabled>\s*\{t\.showModal\.showPast\}/);
  });

  it('Репертуар: у прошедшего — «уже прошёл», без цены и без «временно недоступно»', () => {
    const rep = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    expect(rep).toContain('const salesPaused = !!linkedShow && !linkedPast && isShowSalesPaused(linkedShow.id);');
    expect(rep).toContain('const linkedPrice = linkedShow && !linkedPast');
    expect(rep).toMatch(/isShowPast\(linkedShow\)\s*\? <p className=\{styles\.modalDesc\}>\{t\.showModal\.showPast\}<\/p>/);
  });

  it('админка: метка «Продажи приостановлены» только у предстоящих', () => {
    const card = projectSource('src/pages/AdminPage/AdminShowCard.tsx');
    expect(card).toContain('isShowSalesPaused(show.id) && !(startMs !== null && startMs <= mountedAtMs)');
  });
});

describe('карточки Афиши: без нумерации «01 / 08»', () => {
  it('в разметке нет порядкового номера вида «NN / NN»', () => {
    const html = renderAfisha('2026-10-06T12:00:00Z');
    expect(html).not.toMatch(/\b0\d \/ 0\d\b/);
    expect(renderAfisha('2026-09-01T12:00:00Z')).not.toMatch(/\b0\d \/ 0\d\b/);
  });

  it('в исходниках карточки нет счётчика', () => {
    const slider = projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.tsx');
    expect(slider).not.toContain('padStart');
    expect(slider).not.toContain('styles.counter');
    expect(projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.module.scss')).not.toContain('.counter');
  });
});
