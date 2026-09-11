// Группировка посещённых броней по спектаклю: одна строка на спектакль,
// с числом визитов и датой последнего. Чистая логика — без React.

import type { Booking } from '../../../types/booking';
import type { Show } from '../../../types';
import { SHOWS } from '../../../data/shows';

const SHOW_MAP = new Map<string, Show>(SHOWS.map(s => [s.id, s]));

export interface GroupedShow {
  showId:    string;
  show:      Show | undefined;
  showTitle: string;
  count:     number;
  lastDate:  string;
  lastTime:  string;
}

/** Русское склонение «раз / раза / раз» для счётчика визитов. */
export function pluralRaz(n: number): string {
  if (n >= 11 && n <= 19) return 'раз';
  const last = n % 10;
  if (last >= 2 && last <= 4) return 'раза';
  return 'раз';
}

/** Инициалы спектакля для заглушки вместо афиши. */
export function showInitials(title: string): string {
  const clean = title.replace(/[«»""'']/g, '').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return (title[0] ?? '?').toUpperCase();
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

export function groupAttendedBookings(bookings: Booking[]): GroupedShow[] {
  const map = new Map<string, {
    count: number; lastDate: string; lastTime: string; lastTs: number; showTitle: string;
  }>();
  for (const b of bookings) {
    const ts    = b.createdAt.toMillis();
    const entry = map.get(b.showId);
    if (!entry) {
      map.set(b.showId, { count: 1, lastDate: b.showDate, lastTime: b.showTime, lastTs: ts, showTitle: b.showTitle });
    } else {
      entry.count += 1;
      if (ts > entry.lastTs) {
        entry.lastDate  = b.showDate;
        entry.lastTime  = b.showTime;
        entry.lastTs    = ts;
      }
    }
  }
  return Array.from(map.entries()).map(([showId, d]) => ({
    showId,
    show:      SHOW_MAP.get(showId),
    showTitle: d.showTitle,
    count:     d.count,
    lastDate:  d.lastDate,
    lastTime:  d.lastTime,
  }));
}
