// Единый расчёт времени спектакля. Импортируется и сервером (api/*), и фронтендом.
//
// Театр физически находится в Ницце, поэтому все настенные времена в данных
// («14 Июн 2026», «19:00») означают Europe/Paris. Раньше клиент считал их в
// таймзоне браузера, а сервер — в таймзоне процесса (на Vercel это UTC), из-за
// чего один и тот же спектакль «заканчивался» в разное время. Здесь одна
// реализация, которая всегда переводит настенное парижское время в абсолютный
// момент (мс UTC) и корректно учитывает переход на летнее/зимнее время.
//
// Файл намеренно не использует ни Node-, ни DOM-API — только Intl.

export const THEATRE_TIMEZONE = 'Europe/Paris';

// Спектакль считается завершённым через 2 часа после начала.
export const SHOW_END_BUFFER_MS = 2 * 60 * 60 * 1000;

// Трёхбуквенные русские сокращения месяцев, в которых хранится showDate.
export const MONTH_RU: Record<string, number> = {
  'Янв': 0, 'Фев': 1, 'Мар': 2,  'Апр': 3,
  'Май': 4, 'Июн': 5, 'Июл': 6,  'Авг': 7,
  'Сен': 8, 'Окт': 9, 'Ноя': 10, 'Дек': 11,
};

// Смещение таймзоны (в мс) для конкретного абсолютного момента.
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year:   'numeric', month:  '2-digit', day:    '2-digit',
    hour:   '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const pick = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? '0');

  // В некоторых движках полночь форматируется как «24» — нормализуем.
  const hour = pick('hour') === 24 ? 0 : pick('hour');

  const asIfUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'));
  return asIfUtc - utcMs;
}

// Настенное время Europe/Paris → абсолютный момент (мс UTC).
// Двухпроходный расчёт нужен из-за DST: смещение зависит от искомого результата.
export function parisWallClockToUtcMs(
  year: number, monthIndex: number, day: number, hour: number, minute: number,
): number {
  const guess     = Date.UTC(year, monthIndex, day, hour, minute, 0);
  const firstPass = guess - timeZoneOffsetMs(guess, THEATRE_TIMEZONE);
  const secondOff = timeZoneOffsetMs(firstPass, THEATRE_TIMEZONE);
  return guess - secondOff;
}

// «14 Июн 2026» + «19:00» → абсолютный момент начала (мс UTC), либо null.
export function parseShowStartUtcMs(showDate: string, showTime: string): number | null {
  const parts = String(showDate ?? '').trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const [dayStr, monthStr, yearStr] = parts;
  const monthIndex = MONTH_RU[monthStr!];
  if (monthIndex === undefined) return null;

  const [hourStr, minuteStr] = String(showTime ?? '').split(':');
  const day    = parseInt(dayStr!, 10);
  const year   = parseInt(yearStr!, 10);
  const hour   = parseInt(hourStr ?? '', 10);
  const minute = parseInt(minuteStr ?? '0', 10);

  if (!Number.isFinite(day) || !Number.isFinite(year) || !Number.isFinite(hour)) return null;
  if (day < 1 || day > 31 || hour < 0 || hour > 23) return null;

  return parisWallClockToUtcMs(year, monthIndex, day, hour, Number.isFinite(minute) ? minute : 0);
}

// Момент, после которого спектакль считается сыгранным.
export function showEndUtcMs(startUtcMs: number): number {
  return startUtcMs + SHOW_END_BUFFER_MS;
}

// Спектакль уже начался?
export function hasShowStarted(startUtcMs: number, nowMs: number = Date.now()): boolean {
  return startUtcMs <= nowMs;
}

// Спектакль уже закончился (начало + буфер)?
export function hasShowEnded(startUtcMs: number, nowMs: number = Date.now()): boolean {
  return showEndUtcMs(startUtcMs) < nowMs;
}
