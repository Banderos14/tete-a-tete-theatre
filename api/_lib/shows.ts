// Серверный каталог спектаклей — единственный источник правды по ценам и датам.
//
// ВАЖНО: при изменении расписания правь ЭТОТ файл и src/data/shows.ts.
// Совпадение id, дат, времени и цен проверяется тестом
// tests/unit/shows-contract.test.ts — он упадёт, если файлы разъедутся.

import { parseShowStartUtcMs } from './showTime.js';

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
  tickets: Partial<Record<TicketTypeId, TicketInfo>>;
}

// Вместимость зала — единый источник правды.
// src/config/theatre.ts реэкспортирует именно это значение.
export const THEATRE_CAPACITY = 100;

// Максимум билетов в одной брони.
export const MAX_TICKETS_PER_BOOKING = 10;

export const SHOWS: Record<string, ShowInfo> = {
  romantika: {
    title: '«Романтика обреченности»', titleFR: '«La Romanesque de la Fatalité»',
    day: '14', month: 'Июн', time: '19:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
    },
  },
  shutka: {
    title: '«И в шутку, и всерьёз»', titleFR: '«Sérieusement ou pas»',
    day: '28', month: 'Июн', time: '20:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
      student:  { label: 'Студенческий', labelFR: 'Étudiant', price: 10 },
    },
  },
  nulin: {
    title: '«Граф Нулин»', titleFR: '«Le Comte Nouline»',
    day: '12', month: 'Июл', time: '20:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 30 },
      student:  { label: 'Студенческий', labelFR: 'Étudiant', price: 20 },
    },
  },
};

export function showDateString(show: ShowInfo): string {
  return `${show.day} ${show.month} ${show.year}`;
}

// Абсолютный момент начала спектакля (мс UTC) по данным каталога.
export function showStartUtcMs(show: ShowInfo): number | null {
  return parseShowStartUtcMs(showDateString(show), show.time);
}
