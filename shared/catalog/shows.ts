// Серверный каталог спектаклей — единственный источник правды по ценам и датам.
//
// ВАЖНО: при изменении расписания правь ЭТОТ файл и src/data/shows.ts.
// Совпадение id, дат, времени и цен проверяется тестом
// tests/unit/shows-contract.test.ts — он упадёт, если файлы разъедутся.

import { parseShowStartUtcMs } from '../domain/showTime.js';

export type TicketTypeId = 'standard' | 'student';

export interface TicketInfo {
  label:   string;
  labelFR: string;
  price:   number;
}

export interface ShowInfo {
  title:   string;
  titleFR: string;
  day:     string;
  month:   string;
  time:    string;
  year:    string;
  // Спектакль показан в Афише и доступен для бронирования.
  //
  // false — заготовка сезона: дата с афиши уже зафиксирована в коде, но фото,
  // описания и цен ещё нет. Такой спектакль намеренно не попадает в SHOWS,
  // поэтому его нельзя ни забронировать, ни увидеть в остатке мест.
  published: boolean;
  tickets: Partial<Record<TicketTypeId, TicketInfo>>;
}

// Вместимость зала — единый источник правды. Каталог лежит в shared/, поэтому
// и сервер, и фронтенд берут значение отсюда напрямую; авторитетная проверка
// вместимости происходит на сервере в транзакции создания брони.
export const THEATRE_CAPACITY = 50;

// Максимум билетов в одной брони.
export const MAX_TICKETS_PER_BOOKING = 10;

// Весь сезон целиком — и опубликованное, и заготовки. Нужен затем, чтобы дата
// спектакля была записана ровно в одном месте ещё до того, как появятся
// материалы: когда придут фото и цены, останется поднять published в true.
export const SEASON_CATALOG: Record<string, ShowInfo> = {
  // ── Сентябрь 2026 ──
  romantika: {
    title: '«Романтика обреченности»', titleFR: '«La Romanesque de la Fatalité»',
    day: '17', month: 'Сен', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
    },
  },

  // ── Октябрь 2026 ──
  shutka: {
    title: '«И в шутку, и всерьёз»', titleFR: '«Sérieusement ou pas»',
    day: '02', month: 'Окт', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
      student:  { label: 'Студенческий', labelFR: 'Étudiant', price: 10 },
    },
  },
  korablik: {
    title: '«Приключения кораблика»', titleFR: '«Les Aventures du petit bateau»',
    day: '04', month: 'Окт', time: '10:00', year: '2026',
    published: false,
    tickets: {},
  },
  razgovor: {
    title: '«Разговор, которого не было»', titleFR: '«La conversation qui n\'a pas eu lieu»',
    day: '16', month: 'Окт', time: '20:00', year: '2026',
    published: false,
    tickets: {},
  },
  enot: {
    title: '«Крошка Енот»', titleFR: '«Le Petit Raton laveur»',
    day: '18', month: 'Окт', time: '10:00', year: '2026',
    published: false,
    tickets: {},
  },

  // ── Ноябрь 2026 ──
  lubov: {
    title: '«Счастливая любовь»', titleFR: '«Un amour heureux»',
    day: '14', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
    tickets: {},
  },
  shapochka: {
    title: '«Красная Шапочка»', titleFR: '«Le Petit Chaperon rouge»',
    day: '15', month: 'Ноя', time: '10:00', year: '2026',
    published: false,
    tickets: {},
  },
  letuchiy: {
    title: '«Летучий корабль»', titleFR: '«Le Vaisseau volant»',
    day: '22', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
    tickets: {},
  },
  kovcheg: {
    title: '«У ковчега в восемь»', titleFR: '«À l\'arche à huit heures»',
    day: '28', month: 'Ноя', time: '19:00', year: '2026',
    published: false,
    tickets: {},
  },
};

// Афиша и бронирование видят ТОЛЬКО опубликованные спектакли: валидация
// создания брони, остаток мест и проверка актуальности билета ходят сюда.
// Неопубликованная заготовка для них просто не существует — /api/create-booking
// ответит «Invalid showId», а не продаст билет на спектакль без цены.
export const SHOWS: Record<string, ShowInfo> = Object.fromEntries(
  Object.entries(SEASON_CATALOG).filter(([, show]) => show.published),
);

// Заготовки сезона: дата известна, материалов ещё нет.
export const DRAFT_SHOWS: Record<string, ShowInfo> = Object.fromEntries(
  Object.entries(SEASON_CATALOG).filter(([, show]) => !show.published),
);

export function showDateString(show: ShowInfo): string {
  return `${show.day} ${show.month} ${show.year}`;
}

// Абсолютный момент начала спектакля (мс UTC) по данным каталога.
export function showStartUtcMs(show: ShowInfo): number | null {
  return parseShowStartUtcMs(showDateString(show), show.time);
}
