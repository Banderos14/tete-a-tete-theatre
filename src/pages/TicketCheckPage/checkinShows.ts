// Спектакли и время для экрана проверки. Без React — проверяется тестом.

import { SHOWS, showDateString, showStartUtcMs } from '../../../shared/catalog/shows';
import { showEndUtcMs } from '../../../shared/domain/showTime';

export interface CheckinShowOption {
  id:      string;
  label:   string;
  startMs: number;
}

/** Опубликованные спектакли в порядке начала. */
export function checkinShowOptions(): CheckinShowOption[] {
  return Object.entries(SHOWS)
    .map(([id, show]) => ({
      id,
      label:   `${showDateString(show)} · ${show.time} — ${show.title.replace(/[«»]/g, '')}`,
      startMs: showStartUtcMs(show) ?? 0,
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

/** Каталог статичен в пределах сборки — список спектаклей считается один раз. */
export const SHOW_OPTIONS: CheckinShowOption[] = checkinShowOptions();

// Только выбор спектакля ПО УМОЛЧАНИЮ в списке сканера: вечером спектакля и
// до конца той же ночи предлагаем его, а не следующий. На право прохода это
// не влияет — сервер проверяет лишь, что билет на выбранный спектакль.
const SAME_EVENING_MS = 6 * 60 * 60 * 1000;

/**
 * Спектакль, с которым сотрудник, скорее всего, работает сейчас: первый, чей
 * вечер ещё не закончился. Если сезон позади — последний.
 */
export function currentShowId(options: CheckinShowOption[], nowMs: number = Date.now()): string | null {
  if (options.length === 0) return null;
  const upcoming = options.find(o => o.startMs > 0 && showEndUtcMs(o.startMs) + SAME_EVENING_MS >= nowMs);
  return (upcoming ?? options[options.length - 1]!).id;
}

/** Время прохода по Парижу: «19:42, 17.09»; null — прохода ещё не было. */
export function formatAttendedAt(ms: number | null): string | null {
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}, ${get('day')}.${get('month')}`;
}
