// Единый расчёт времени спектакля. Изоморфный модуль: импортируется и сервером,
// и фронтендом, поэтому не тянет ни firebase-admin, ни node:*, ни DOM.
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

/**
 * Бронь в том виде, в каком её знает вопрос «на какой сеанс выписан билет».
 * Структурный тип: подходит и документ Firestore на сервере, и Booking на
 * клиенте — общее у них только эти три поля.
 */
export interface BookingOccurrence {
  /** Абсолютный момент начала, записанный в момент покупки. */
  showStartAt?: { toMillis?: () => number; seconds?: number } | null;
  showDate?: string;
  showTime?: string;
}

/**
 * Момент начала СЕАНСА, на который выписана бронь (мс UTC), либо null.
 *
 * Источник — сама бронь, а НЕ каталог спектаклей. Это и есть граница между
 * «спектаклем» и «конкретным показом»: каталог описывает, что идёт сейчас, и
 * его дату можно перенести; бронь описывает вечер, на который зритель купил
 * билет, и он зафиксирован навсегда. Если считать актуальность билета по
 * каталогу, перенос того же showId на новую дату превращает старые билеты
 * в действительные на новый показ.
 *
 * showStartAt пишется сервером при создании брони. У броней, созданных до
 * появления этого поля, момент восстанавливается из строковых showDate и
 * showTime как настенное время Europe/Paris.
 */
export function bookingOccurrenceStartUtcMs(booking: BookingOccurrence): number | null {
  const raw = booking.showStartAt;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?.seconds === 'number')    return raw.seconds * 1000;

  return parseShowStartUtcMs(String(booking.showDate ?? ''), String(booking.showTime ?? ''));
}

/**
 * Календарный день спектакля по Парижу: «2026-09-17». Нужен identity сеанса:
 * время внутри вечера можно поправить (20:00 → 20:30), а день — это уже
 * другой сеанс.
 */
export function parisDateKey(utcMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: THEATRE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(utcMs));
  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
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
