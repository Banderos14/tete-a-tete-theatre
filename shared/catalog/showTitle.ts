// Локализация названия спектакля для брони, билета, PDF и письма.
//
// Бронь хранит КАНОНИЧЕСКОЕ русское название (showTitle) — это снимок вечера,
// на который продан билет, и переписывать его нельзя. Французскую версию
// в Firestore не дублируем: перевод уже есть в каталоге, и находится он
// по showId.
//
// Отсюда два правила, которые и делают эту функцию единственным местом
// локализации названия:
//
//   • RU — сначала снимок брони. Если название спектакля позже отредактируют,
//     старый билет должен показывать то, что на нём напечатано.
//   • FR — сначала каталог по showId. Снимок французского названия не содержит,
//     поэтому без каталога FR-интерфейс показывал бы русский текст.
//
// Исторический билет не ломается, если спектакль исчез из каталога: при
// отсутствии showId в каталоге возвращается снимок брони.

import { SEASON_CATALOG } from './shows.js';

export type TitleLang = 'RU' | 'FR';

/** Всё, из чего можно получить название: снимок брони, ответ API, карточка билета. */
export interface ShowTitleSource {
  showId?:      string;
  showTitle?:   string;
  /** Французское название, если вызывающий уже знает его (ответ /api/create-booking). */
  showTitleFR?: string;
}

export function localizedShowTitle(source: ShowTitleSource, lang: TitleLang): string {
  const snapshot = String(source.showTitle ?? '').trim();

  // Каталог сезона, а не SHOWS: неопубликованная заготовка тоже должна
  // переводиться — билет на неё может существовать раньше публикации.
  const catalog = source.showId ? SEASON_CATALOG[source.showId] : undefined;

  if (lang === 'RU') return snapshot || catalog?.title || '';

  return catalog?.titleFR
    || String(source.showTitleFR ?? '').trim()
    || snapshot
    || '';
}
