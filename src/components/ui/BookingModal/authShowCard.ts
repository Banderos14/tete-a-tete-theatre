// Что показать о спектакле слева от формы входа.
//
// Данные берутся из того же объекта show, что открыт в Афише, Репертуаре и
// ShowModal: постер — show.image, кадрирование — show.imagePosition. Отдельной
// таблицы «спектакль → картинка» у модалки нет, поэтому новый постер в каталоге
// появляется здесь сам.

import type { Show } from '../../../types';
import type { MonthKey, T } from '../../../i18n/types';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';

export interface AuthShowCard {
  title:  string;
  /** «15 Ноя · 10:00» / «15 Novembre · 10:00». */
  meta:   string;
  /** null — официального постера нет: остаётся текстовая карточка. */
  poster: string | null;
  posterPosition?: string;
  posterAlt: string;
}

export function buildAuthShowCard(
  show: Pick<Show, 'id' | 'title' | 'titleFR' | 'day' | 'month' | 'time' | 'image' | 'imagePosition'>,
  lang: 'RU' | 'FR',
  t: Pick<T, 'months' | 'booking'>,
): AuthShowCard {
  const title  = localizedShowTitle({ showId: show.id, showTitle: show.title, showTitleFR: show.titleFR }, lang);
  const month  = t.months[show.month as MonthKey] ?? show.month;
  const poster = show.image?.trim() || null;
  return {
    title,
    meta:      `${show.day} ${month} · ${show.time}`,
    poster,
    ...(poster && show.imagePosition ? { posterPosition: show.imagePosition } : {}),
    posterAlt: t.booking.posterAlt(title),
  };
}
