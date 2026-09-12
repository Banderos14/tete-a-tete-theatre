// Серверный каталог спектаклей — единственный источник правды по ценам и датам.
//
// ВАЖНО: при изменении расписания правь ЭТОТ файл и src/data/shows.ts.
// Совпадение id, дат, времени и цен проверяется тестом
// tests/unit/pastShows.test.ts — он упадёт, если файлы разъедутся.

import { parseShowStartUtcMs } from '../domain/showTime.js';

export type TicketTypeId = 'standard' | 'student' | 'child' | 'adult' | 'family';

export interface TicketInfo {
  label:   string;
  labelFR: string;
  price:   number;
  /** Сколько мест в зале занимает одна единица тарифа. Семейный билет занимает три. */
  seats:   number;
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

// Весь сезон целиком. Сейчас все девять показов опубликованы; будущие даты
// можно сначала завести здесь с published: false, пока нет материалов и цен.
export const SEASON_CATALOG: Record<string, ShowInfo> = {
  // ── Сентябрь 2026 ──
  romantika: {
    title: '«Романтика обреченности»', titleFR: '«La Romanesque de la Fatalité»',
    day: '17', month: 'Сен', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 20, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, seats: 1 },
    },
  },

  // ── Октябрь 2026 ──
  shutka: {
    title: '«И в шутку, и всерьёз»', titleFR: '«Sérieusement ou pas»',
    day: '02', month: 'Окт', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  korablik: {
    title: '«Приключения кораблика»', titleFR: '«Les Aventures du petit bateau»',
    day: '04', month: 'Окт', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },
  razgovor: {
    title: '«Разговор, которого не было»', titleFR: '«La conversation qui n\'a pas eu lieu»',
    day: '16', month: 'Окт', time: '20:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 25, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  enot: {
    title: '«Крошка Енот»', titleFR: '«Le Petit Raton laveur»',
    day: '18', month: 'Окт', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },

  // ── Ноябрь 2026 ──
  lubov: {
    title: '«Счастливая любовь»', titleFR: '«Un amour heureux»',
    day: '14', month: 'Ноя', time: '19:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 20, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 15, seats: 1 },
    },
  },
  shapochka: {
    title: '«Красная Шапочка»', titleFR: '«Le Petit Chaperon rouge»',
    day: '15', month: 'Ноя', time: '10:00', year: '2026',
    published: true,
    tickets: {
      child:  { label: 'Ребёнок', labelFR: 'Enfant', price: 20, seats: 1 },
      adult:  { label: 'Взрослый', labelFR: 'Adulte', price: 15, seats: 1 },
      family: { label: 'Ребёнок + 2 родителя', labelFR: 'Enfant + 2 parents', price: 45, seats: 3 },
    },
  },
  letuchiy: {
    title: '«Летучий корабль»', titleFR: '«Le Vaisseau volant»',
    day: '21', month: 'Ноя', time: '19:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
  },
  kovcheg: {
    title: '«У ковчега в восемь»', titleFR: '«À l\'arche à huit heures»',
    day: '28', month: 'Ноя', time: '19:00', year: '2026',
    published: true,
    tickets: {
      standard: { label: 'Обычный', labelFR: 'Plein tarif', price: 30, seats: 1 },
      student:  { label: 'Ученик / студент', labelFR: 'Scolaire / étudiant', price: 20, seats: 1 },
    },
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
