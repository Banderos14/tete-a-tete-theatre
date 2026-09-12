import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHOWS, DRAFT_SHOWS, SEASON_CATALOG, showStartUtcMs, showDateString } from '../../shared/catalog/shows.js';
import { parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import { projectSource } from '../helpers/serverSource.js';

const ROOT = resolve(__dirname, '../..');

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
describe('расписание клиента и сервера совпадает', () => {
  const frontend = readFileSync(resolve(ROOT, 'src/data/shows.ts'), 'utf8');

  it('каждый спектакль серверного каталога описан во фронтенде теми же датой, временем и ценами', () => {
    for (const [id, show] of Object.entries(SHOWS)) {
      const block = frontend.slice(frontend.indexOf(`id: '${id}'`));
      const end   = block.indexOf('\n  },\n');
      const chunk = block.slice(0, end > 0 ? end : 2000);

      expect(chunk, `${id}: день`).toContain(`day: '${show.day}'`);
      expect(chunk, `${id}: месяц`).toContain(`month: '${show.month}'`);
      expect(chunk, `${id}: год`).toContain(`year: '${show.year}'`);
      expect(chunk, `${id}: время`).toContain(`time: '${show.time}'`);

      for (const [ticketId, info] of Object.entries(show.tickets)) {
        expect(chunk, `${id}/${ticketId}: цена`).toMatch(
          new RegExp(`id:\\s*'${ticketId}'[^}]*price:\\s*${info!.price}\\b`),
        );
      }
    }
  });

  it('во фронтенде нет бронируемых спектаклей, которых нет на сервере', () => {
    const ids = [...frontend.matchAll(/^\s{4}id: '([a-z]+)',$/gm)].map(m => m[1]!);
    const bookable = ids.filter(id => frontend.includes(`ticketTypes:`) && Object.keys(SHOWS).includes(id));
    expect(bookable.length).toBeGreaterThan(0);
    for (const id of Object.keys(SHOWS)) expect(ids).toContain(id);
  });
});

// Заготовки сезона продублированы так же, как и опубликованные спектакли,
// поэтому расходиться им нельзя: дата в двух файлах — два разных расписания.
describe('заготовки сезона: даты клиента и сервера совпадают', () => {
  const frontend = readFileSync(resolve(ROOT, 'src/data/shows.ts'), 'utf8');
  // Ищем только внутри DRAFT_SHOWS: id вроде 'lubov' встречается ещё и в
  // REPERTOIRE, и поиск по всему файлу нашёл бы не тот блок.
  const drafts = frontend.slice(frontend.indexOf('export const DRAFT_SHOWS'));

  it('у каждой серверной заготовки тот же день, месяц, год и время во фронтенде', () => {
    for (const [id, show] of Object.entries(DRAFT_SHOWS)) {
      const block = drafts.slice(drafts.indexOf(`id: '${id}'`));
      const end   = block.indexOf('\n  },\n');
      const chunk = block.slice(0, end > 0 ? end : 1000);

      expect(chunk, `${id}: дата`).toContain(
        `day: '${show.day}', month: '${show.month}', time: '${show.time}', year: '${show.year}'`,
      );
      expect(chunk, `${id}: признак черновика`).toContain('published: false');
    }
  });

  it('состав заготовок совпадает с фронтендом', () => {
    const ids = [...drafts.matchAll(/^\s{4}id: '([a-z]+)',$/gm)].map(m => m[1]!);
    expect(ids.sort()).toEqual(Object.keys(DRAFT_SHOWS).sort());
  });

  it('заготовку нельзя забронировать: её нет ни в SHOWS, ни в остатке мест', () => {
    for (const id of Object.keys(DRAFT_SHOWS)) {
      expect(Object.hasOwn(SHOWS, id), `${id} не должен быть бронируемым`).toBe(false);
    }
    // validateCreateBooking пускает дальше только то, что лежит в SHOWS.
    expect(projectSource('server/booking/booking.validation.ts'))
      .toContain('!Object.hasOwn(SHOWS, showId)');
  });

  it('у заготовки нет цен — продавать по ней нечего', () => {
    for (const [id, show] of Object.entries(DRAFT_SHOWS)) {
      expect(Object.keys(show.tickets), `${id}: типы билетов`).toHaveLength(0);
    }
  });

  it('SHOWS и DRAFT_SHOWS вместе дают весь сезон и не пересекаются', () => {
    expect([...Object.keys(SHOWS), ...Object.keys(DRAFT_SHOWS)].sort())
      .toEqual(Object.keys(SEASON_CATALOG).sort());
    for (const id of Object.keys(SHOWS)) expect(DRAFT_SHOWS).not.toHaveProperty(id);
  });

  it('заготовка не показывается зрителю — ни в Афише, ни в Репертуаре', () => {
    expect(projectSource('src/pages/HomePage/sections/Afisha/AfishaSlider.tsx'))
      .not.toContain('DRAFT_SHOWS');
    expect(projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx'))
      .not.toContain('DRAFT_SHOWS');
  });
});

describe('интерфейс не предлагает бронировать прошедший спектакль', () => {
  it('ShowModal блокирует кнопку', () => {
    const src = readFileSync(resolve(ROOT, 'src/pages/HomePage/components/ShowModal/ShowModal.tsx'), 'utf8');
    expect(src).toContain('disabled={showIsPast}');
    expect(src).toContain('t.showModal.showPast');
  });

  it('Repertoire не показывает кнопку покупки', () => {
    const src = readFileSync(resolve(ROOT, 'src/pages/HomePage/sections/Repertoire/Repertoire.tsx'), 'utf8');
    expect(src).toContain('isShowPast(linkedShow)');
  });
});
