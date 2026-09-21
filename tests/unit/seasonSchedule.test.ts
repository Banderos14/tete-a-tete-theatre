// Осенняя афиша 2026: расписание как контракт.
//
// Дата спектакля — это не текст на странице, а вход сразу для четырёх правил:
// сервер по ней решает, продавать ли билет; сканер — сегодняшний ли билет;
// админка печатает её в таблице; deep-link открывает карточку. Поэтому дата
// проверяется здесь значениями, а не «глазами по афише».

import { isBookingForShow } from '../../shared/domain/performance.js';
import { describe, it, expect } from 'vitest';
import {
  SHOWS, DRAFT_SHOWS, SEASON_CATALOG, THEATRE_CAPACITY, showDateString, showStartUtcMs,
} from '../../shared/catalog/shows.js';
import { hasShowStarted, parseShowStartUtcMs } from '../../shared/domain/showTime.js';
import { validateCreateBooking } from '../../server/booking/booking.validation.js';
import { generateTicketCode } from '../../server/booking/ticketCode.js';
import { parseTicketCodeFromScan } from '../../src/utils/parseTicketCode.js';
import { endpointSource, projectSource, screenSource } from '../helpers/serverSource.js';
import { getShowPublicUrl, getShowIdFromLocation } from '../../src/utils/showUrl.js';

// Контрольные моменты сезона в настенном времени Ниццы.
const SEP_12 = parseShowStartUtcMs('12 Сен 2026', '12:00')!;
const SEP_18 = parseShowStartUtcMs('18 Сен 2026', '12:00')!;

describe('«Романтика обреченности» — 17 сентября 2026, 20:00', () => {
  const romantika = SHOWS.romantika!;

  it('стоит в каталоге на 17 Сен 2026 в 20:00', () => {
    expect(romantika.day).toBe('17');
    expect(romantika.month).toBe('Сен');
    expect(romantika.year).toBe('2026');
    expect(romantika.time).toBe('20:00');
    expect(showDateString(romantika)).toBe('17 Сен 2026');
  });

  it('июньской даты в каталоге не осталось', () => {
    expect(showDateString(romantika)).not.toContain('Июн');
    expect(projectSource('src/data/shows.ts')).toContain("date: '17.09', day: '17', month: 'Сен', time: '20:00'");
  });

  it('опубликован — значит, виден в Афише и доступен для брони', () => {
    expect(romantika.published).toBe(true);
    expect(SHOWS).toHaveProperty('romantika');
    expect(DRAFT_SHOWS).not.toHaveProperty('romantika');
  });

  it('вместимость зала — 50 мест', () => {
    expect(THEATRE_CAPACITY).toBe(50);
    expect(projectSource('src/data/shows.ts')).toMatch(/id: 'romantika'[\s\S]*?totalSeats: 50/);
  });

  it('12 сентября 2026 спектакль ещё не начался', () => {
    const start = showStartUtcMs(romantika);
    expect(start).not.toBeNull();
    expect(hasShowStarted(start!, SEP_12)).toBe(false);
  });

  it('18 сентября 2026 спектакль уже сыгран', () => {
    expect(hasShowStarted(showStartUtcMs(romantika)!, SEP_18)).toBe(true);
  });
});

describe('бронирование «Романтики» проходит серверную проверку', () => {
  const request = {
    showId: 'romantika',
    ticketType: 'standard',
    ticketsCount: 2,
    paymentMethod: 'on_site',
    phone: '+33 6 12 34 56 78',
    comment: 'тестовая проверка расписания',
    lang: 'RU',
  };

  it('валидация принимает запрос и достаёт спектакль из каталога', () => {
    const validated = validateCreateBooking({ ...request });
    expect(validated.showId).toBe('romantika');
    expect(validated.show.time).toBe('20:00');
    expect(validated.ticketsCount).toBe(2);
    // Цену считает сервер по каталогу — из запроса она не читается.
    expect(validated.show.tickets.standard!.price).toBe(20);
  });

  it('на 12 сентября 2026 правило show_started не срабатывает', () => {
    // То же условие, что стоит в booking.service перед транзакцией.
    const startMs = showStartUtcMs(SHOWS.romantika!);
    expect(startMs !== null && startMs <= SEP_12).toBe(false);
    expect(projectSource('server/booking/booking.service.ts'))
      .toMatch(/startMs !== null && startMs <= Date\.now\(\)/);
  });

  it('заготовку сезона тот же вход забронировать не даёт', () => {
    for (const id of Object.keys(DRAFT_SHOWS)) {
      expect(() => validateCreateBooking({ ...request, showId: id })).toThrow(/Invalid showId/);
    }
  });

  it('спектакль, снятый с продажи, тоже не бронируется', () => {
    // «Граф Нулин» сыгран 12.07.2026 и в осенней афише его нет.
    expect(() => validateCreateBooking({ ...request, showId: 'nulin' })).toThrow(/Invalid showId/);
  });
});

describe('билет «Романтики» доходит до сканера с правильной датой', () => {
  const romantika = SHOWS.romantika!;

  // Поля брони заполняет сервер из каталога — проверяем, что берёт именно оттуда.
  it('в бронь пишутся название, дата и время из каталога, а не из запроса', () => {
    const service = projectSource('server/booking/booking.service.ts');
    expect(service).toContain('const showDate       = showDateString(show);');
    expect(service).toMatch(/showTitle:\s*show\.title/);
    expect(service).toMatch(/showTime:\s*show\.time/);
  });

  it('сканер увидит «17 Сен 2026» и «20:00»', () => {
    // Снимок брони для check-in собирается из тех же полей.
    const booking = {
      showId:       'romantika',
      showTitle:    romantika.title,
      showDate:     showDateString(romantika),
      showTime:     romantika.time,
      ticketsCount: 3,
    };
    expect(booking.showTitle).toBe('«Романтика обреченности»');
    expect(booking.showDate).toBe('17 Сен 2026');
    expect(booking.showTime).toBe('20:00');
    expect(booking.ticketsCount).toBe(3);

    const checkin = endpointSource('api/admin-booking.ts');
    expect(checkin).toMatch(/showTitle:\s*String\(data\.showTitle/);
    expect(checkin).toMatch(/showDate:\s*String\(data\.showDate/);
    expect(checkin).toMatch(/showTime:\s*String\(data\.showTime/);
    expect(checkin).toMatch(/ticketsCount:\s*typeof data\.ticketsCount === 'number'/);

    const scanner = screenSource('src/pages/TicketCheckPage');
    expect(scanner).toContain('showDate');
    expect(scanner).toContain('showTime');
    expect(scanner).toContain('ticketsCount');
  });

  it('код билета из QR разбирается сканером обратно', () => {
    const code = generateTicketCode();
    const qr   = `https://www.theatre-teteatete.fr/#/admin/checkin?ticket=${code}`;
    expect(parseTicketCodeFromScan(qr)).toBe(code);
  });

  it('актуальность билета считается по сеансу самой брони, а не по каталогу', () => {
    // Спектакль перенесён с 14 Июн на 17 Сен. Если бы сканер брал дату из
    // каталога по showId, июньский билет стал бы действительным на сентябрьский
    // показ. Подробно сценарий разобран в tests/unit/performance.test.ts.
    expect(showDateString(SHOWS.romantika!)).not.toBe('14 Июн 2026');
    expect(isBookingForShow({ showId: 'romantika', showDate: '14 Июн 2026', showTime: '19:00' }, 'romantika')).toBe(false);
    expect(endpointSource('api/admin-booking.ts')).toContain('isBookingForShow(data, showId)');
  });
});

describe('deep-link /#/?show=<id> открывает опубликованный спектакль', () => {
  it('ссылка строится в формате HashRouter', () => {
    // Без /#/ Vercel отдаёт 404 при прямом переходе по ссылке.
    expect(getShowPublicUrl('romantika')).toMatch(/\/#\/\?show=romantika$/);
    expect(getShowPublicUrl('a b&c')).toContain(encodeURIComponent('a b&c'));
  });

  it('разбор понимает и ?show= до решётки, и хвост после неё', () => {
    const at = (search: string, hash: string) =>
      getShowIdFromLocation({ search, hash } as Location);

    expect(at('', '#/?show=romantika')).toBe('romantika');
    expect(at('?show=romantika', '#/')).toBe('romantika');
    expect(at('', '#/')).toBeNull();
  });

  it('у каждого опубликованного спектакля есть карточка репертуара — иначе ссылка ни во что не упрётся', () => {
    const repertoireIds = [...projectSource('src/data/shows.ts')
      .slice(projectSource('src/data/shows.ts').indexOf('export const REPERTOIRE'))
      .matchAll(/id: '([a-z]+)', status:/g)].map(m => m[1]!);

    for (const id of Object.keys(SHOWS)) expect(repertoireIds).toContain(id);
  });

  it('deep-link открывает модалку спектакля только для того, что лежит в SHOWS', () => {
    const repertoire = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.tsx');
    expect(repertoire).toContain('getShowIdFromLocation()');
    expect(repertoire).toContain('SHOWS.find(show => show.id === slug)');
  });
});

describe('сезон целиком: осенняя афиша 2026', () => {
  const EXPECTED: Array<[string, string, string, string]> = [
    ['romantika', '17', 'Сен', '20:00'],
    ['shutka',    '02', 'Окт', '20:00'],
    ['korablik',  '04', 'Окт', '10:00'],
    ['razgovor',  '16', 'Окт', '20:00'],
    ['enot',      '18', 'Окт', '10:00'],
    ['lubov',     '14', 'Ноя', '19:00'],
    ['shapochka', '15', 'Ноя', '10:00'],
    ['letuchiy',  '21', 'Ноя', '19:00'],
    ['kovcheg',   '28', 'Ноя', '19:00'],
  ];

  it('в каталоге ровно девять спектаклей афиши', () => {
    expect(Object.keys(SEASON_CATALOG)).toHaveLength(EXPECTED.length);
  });

  it('дата и время каждого совпадают с афишей', () => {
    for (const [id, day, month, time] of EXPECTED) {
      const show = SEASON_CATALOG[id];
      expect(show, `спектакль ${id} потерян`).toBeDefined();
      expect(`${show!.day} ${show!.month} ${show!.time}`, id).toBe(`${day} ${month} ${time}`);
      expect(show!.year, id).toBe('2026');
    }
  });

  it('весь сезон идёт после 12 сентября 2026 — прошедших дат в афише нет', () => {
    for (const [id, show] of Object.entries(SEASON_CATALOG)) {
      expect(hasShowStarted(showStartUtcMs(show)!, SEP_12), id).toBe(false);
    }
  });

  it('все девять спектаклей опубликованы в афише', () => {
    expect(Object.keys(SHOWS).sort()).toEqual(EXPECTED.map(([id]) => id).sort());
    expect(Object.keys(DRAFT_SHOWS)).toEqual([]);
  });

  it('цены совпадают с программой открытия восьмого сезона', () => {
    expect(SHOWS.romantika!.tickets.standard!.price).toBe(20);
    expect(SHOWS.romantika!.tickets.student!.price).toBe(15);
    expect(SHOWS.shutka!.tickets.standard!.price).toBe(30);
    expect(SHOWS.shutka!.tickets.student!.price).toBe(20);
    expect(SHOWS.razgovor!.tickets.standard!.price).toBe(25);
    expect(SHOWS.razgovor!.tickets.student!.price).toBe(20);
    expect(SHOWS.lubov!.tickets.standard!.price).toBe(20);
    expect(SHOWS.lubov!.tickets.student!.price).toBe(15);
    expect(SHOWS.letuchiy!.tickets.standard!.price).toBe(30);
    expect(SHOWS.kovcheg!.tickets.student!.price).toBe(20);
  });

  it('детские спектакли предлагают детский, взрослый и семейный тарифы', () => {
    for (const id of ['korablik', 'enot', 'shapochka']) {
      const tickets = SHOWS[id]!.tickets;
      expect(tickets.child!.price, id).toBe(20);
      expect(tickets.adult!.price, id).toBe(15);
      expect(tickets.family!.price, id).toBe(45);
      expect(tickets.family!.seats, id).toBe(3);
    }
  });
});
