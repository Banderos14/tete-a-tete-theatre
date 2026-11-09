// Подпись сеанса без React — проверяется юнит-тестом.

import type { Show } from '../../../../types';
import { parseShowStartUtcMs, THEATRE_TIMEZONE } from '../../../../../shared/domain/showTime';

/** «сб, 13 Дек 2026 · 18:00» / «sam. 13 Décembre 2026 · 18:00» — день недели по Парижу. */
export function sessionDateLabel(show: Pick<Show, 'day' | 'month' | 'year' | 'time'>, lang: 'RU' | 'FR', months: Record<string, string>): string {
  const start = parseShowStartUtcMs(`${show.day} ${show.month} ${show.year}`, show.time);
  const weekday = start === null ? '' : new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'ru-RU', {
    weekday: 'short', timeZone: THEATRE_TIMEZONE,
  }).format(new Date(start));
  const date = `${show.day} ${months[show.month] ?? show.month} ${show.year}`;
  return `${weekday ? `${weekday}${lang === 'FR' ? ' ' : ', '}` : ''}${date} · ${show.time}`;
}
