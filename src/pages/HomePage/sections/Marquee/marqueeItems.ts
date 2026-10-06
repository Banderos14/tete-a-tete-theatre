// Пункты бегущей строки — без React, чтобы правило проверялось юнит-тестом.
//
// Спектакли берутся из того же списка, что у Афиши (afishaShows в
// src/data/shows.ts: опубликованные и ещё не начавшиеся), поэтому прошедший
// спектакль исчезает из строки сам — дат вручную здесь нет. Порядок — по
// ближайшему началу. Постоянный хвост («Сезон …», адрес) — из i18n.

import { afishaShows } from '../../../../data/shows';
import { parseShowStartUtcMs } from '../../../../../shared/domain/showTime';
import type { Show } from '../../../../types';

/** Сколько ближайших спектаклей показывать в строке. */
export const MARQUEE_MAX_SHOWS = 6;

const startOf = (s: Show) =>
  parseShowStartUtcMs(`${s.day} ${s.month} ${s.year}`, s.time) ?? Number.POSITIVE_INFINITY;

/** «18.10 · «Крошка Енот»» — ближайшие спектакли на момент nowMs. */
export function marqueeShowItems(nowMs: number, lang: 'RU' | 'FR'): string[] {
  return afishaShows(nowMs)
    .slice()
    .sort((a, b) => startOf(a) - startOf(b))
    .slice(0, MARQUEE_MAX_SHOWS)
    .map(s => `${s.date} · ${lang === 'FR' ? (s.titleFR ?? s.title) : s.title}`);
}

/**
 * Вся строка: ближайшие спектакли + постоянный хвост. «Бронирование открыто»
 * добавляется только в обычном режиме продаж — в ограниченном часть
 * спектаклей не продаётся.
 */
export function marqueeItems(opts: {
  nowMs: number;
  lang: 'RU' | 'FR';
  tail: readonly string[];
  bookingOpen: string | null;
}): string[] {
  return [
    ...marqueeShowItems(opts.nowMs, opts.lang),
    ...opts.tail,
    ...(opts.bookingOpen ? [opts.bookingOpen] : []),
  ];
}
