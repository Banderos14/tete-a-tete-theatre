import { describe, it, expect } from 'vitest';
import { SHOWS, DRAFT_SHOWS, SEASON_CATALOG, showStartUtcMs, showDateString } from '../../shared/catalog/shows.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import { projectSource } from '../helpers/serverSource.js';
import { SHOWS as FRONT_SHOWS, PUBLISHED_SHOWS, PUBLISHED_REPERTOIRE } from '../../src/data/shows';

describe('серверная защита от продажи билетов в прошлое', () => {
  it('create-booking отклоняет спектакль, который уже начался', () => {
    const src = projectSource('server/booking/booking.service.ts');
    expect(src).toContain("conflict('Show has already started', 'show_started')");
    expect(src).toMatch(/startMs !== null && startMs <= Date\.now\(\)/);
  });

  it('проверка стоит ДО записи в Firestore', () => {
    const src = projectSource('server/booking/booking.service.ts');
    expect(src.indexOf("'show_started'")).toBeLessThan(src.indexOf('runTransaction'));
  });
});

describe('каталог спектаклей: время начала считается однозначно', () => {
  it('у каждого спектакля вычислимое время начала', () => {
    for (const [id, show] of Object.entries(SHOWS)) {
      expect(showStartUtcMs(show), `спектакль ${id}`).not.toBeNull();
    }
  });

  it('showDateString совпадает с форматом, который разбирает parseShowStartUtcMs', () => {
    for (const show of Object.values(SHOWS)) {
      expect(parseShowStartUtcMs(showDateString(show), show.time)).toBe(showStartUtcMs(show));
    }
  });
});

// Контрактный тест: расписание продублировано в серверном каталоге и во фронтенде.
// Расхождение означает, что сервер посчитает не ту сумму или отвергнет бронь.
// Один источник фактов: SEASON_CATALOG. Фронтенд (src/data/shows.ts) не
// повторяет дату, цены, тарифы и признак публикации — собирает их из каталога.
// Раньше эти данные жили в двух файлах, и признак публикации разошёлся:
// «Летучий корабль» был скрыт на сайте, но продавался сервером и числился
// активным в админке и сканере.
describe('сайт и сервер: один каталог спектаклей', () => {
  it('SHOWS сайта — ровно спектакли каталога, в его порядке', () => {
    expect(FRONT_SHOWS.map(s => s.id)).toEqual(Object.keys(SEASON_CATALOG));
  });

  it('дата, время, название, публикация и тарифы — те же, что у сервера', () => {
    for (const show of FRONT_SHOWS) {
      const info = SEASON_CATALOG[show.id]!;
      expect([show.day, show.month, show.time, show.year], show.id).toEqual([info.day, info.month, info.time, info.year]);
      expect([show.title, show.titleFR], show.id).toEqual([info.title, info.titleFR]);
      expect(show.published, show.id).toBe(info.published);
      expect(show.ticketTypes.map(t => [t.id, t.price, t.seats, t.label, t.labelFR]), show.id).toEqual(
        Object.entries(info.tickets).map(([id, t]) => [id, t!.price, t!.seats, t!.label, t!.labelFR]),
      );
    }
  });

  it('опубликованное на сайте = бронируемое на сервере', () => {
    expect(PUBLISHED_SHOWS.map(s => s.id).sort()).toEqual(Object.keys(SHOWS).sort());
    expect(FRONT_SHOWS.filter(s => s.published === false).map(s => s.id).sort()).toEqual(Object.keys(DRAFT_SHOWS).sort());
  });

  it('подпись цены строится из тарифов каталога и совпадает с прежним текстом афиши', () => {
    const expected: Record<string, [string, string]> = {
      "romantika": [
            "20 € / 15 € (ученики и студенты)",
            "20 € / 15 € (scolaires et étudiants)"
      ],
      "shutka": [
            "30 € / 20 € (ученики и студенты)",
            "30 € / 20 € (scolaires et étudiants)"
      ],
      "korablik": [
            "20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)",
            "20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)"
      ],
      "razgovor": [
            "25 € / 20 € (ученики и студенты)",
            "25 € / 20 € (scolaires et étudiants)"
      ],
      "enot": [
            "20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)",
            "20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)"
      ],
      "lubov": [
            "20 € / 15 € (ученики и студенты)",
            "20 € / 15 € (scolaires et étudiants)"
      ],
      "shapochka": [
            "20 € (ребёнок) / 15 € (взрослый) / 45 € (ребёнок + 2 родителя)",
            "20 € (enfant) / 15 € (adulte) / 45 € (enfant + 2 parents)"
      ],
      "letuchiy": [
            "30 € / 20 € (ученики и студенты)",
            "30 € / 20 € (scolaires et étudiants)"
      ],
      "kovcheg": [
            "30 € / 20 € (ученики и студенты)",
            "30 € / 20 € (scolaires et étudiants)"
      ]
    };
    for (const show of FRONT_SHOWS) {
      expect([show.price, show.priceFR], show.id).toEqual(expected[show.id]);
    }
  });

  it('данные сайта не дублируют факты каталога — их больше не нужно править в двух местах', () => {
    // Проверяются данные, а не комментарии-инструкции к ним.
    const data = projectSource('src/data/shows.ts').replace(/\/\/.*$/gm, '');
    for (const dup of [/\bprice:\s*'/, /\bticketTypes:\s*\[/, /\bday:\s*'\d/, /\btotalSeats:\s*\d/, /\bpublished:\s*(true|false)/]) {
      expect(data, String(dup)).not.toMatch(dup);
    }
  });
});

describe('заготовки сезона', () => {
  it('заготовку нельзя забронировать: её нет ни в SHOWS, ни в остатке мест', () => {
    for (const id of Object.keys(DRAFT_SHOWS)) {
      expect(Object.hasOwn(SHOWS, id), `${id} не должен быть бронируемым`).toBe(false);
    }
    // validateCreateBooking пускает дальше только то, что лежит в SHOWS.
    expect(projectSource('server/booking/booking.validation.ts'))
      .toContain('!Object.hasOwn(SHOWS, showId)');
  });

  it('SHOWS и DRAFT_SHOWS вместе дают весь сезон и не пересекаются', () => {
    expect([...Object.keys(SHOWS), ...Object.keys(DRAFT_SHOWS)].sort())
      .toEqual(Object.keys(SEASON_CATALOG).sort());
    for (const id of Object.keys(SHOWS)) expect(DRAFT_SHOWS).not.toHaveProperty(id);
  });

  it('заготовка не показывается зрителю — ни в Афише, ни в Репертуаре', () => {
    for (const id of Object.keys(DRAFT_SHOWS)) {
      expect(PUBLISHED_SHOWS.some(s => s.id === id), id).toBe(false);
      expect(PUBLISHED_REPERTOIRE.some(r => r.id === id), id).toBe(false);
    }
    expect(projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.tsx')).toContain('PUBLISHED_SHOWS');
    expect(projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx')).toContain('PUBLISHED_REPERTOIRE');
  });

  it('заготовка остаётся в полном каталоге сайта — по ней читаются старые брони', () => {
    for (const id of Object.keys(DRAFT_SHOWS)) expect(FRONT_SHOWS.some(s => s.id === id), id).toBe(true);
  });
});

describe('интерфейс не предлагает бронировать прошедший спектакль', () => {
  it('ShowModal блокирует кнопку', () => {
    const src = projectSource('src/pages/HomePage/components/ShowModal/ShowModal.tsx');
    expect(src).toContain('disabled={showIsPast}');
    expect(src).toContain('t.showModal.showPast');
  });

  it('Repertoire не показывает кнопку покупки', () => {
    const src = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    expect(src).toContain('isShowPast(linkedShow)');
  });
});
