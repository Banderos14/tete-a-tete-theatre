// Билет выписан на конкретный спектакль — и только на нём по нему проходят.
//
// Временных окон нет: пропустить можно в любой момент. Но билет одного
// спектакля (или другого вечера того же спектакля) не проходит как билет
// выбранного. Регрессия, ради которой правило появилось: «Романтика
// обреченности» перенесена с 14.06 на 17.09 с тем же id — июньские билеты
// не должны становиться билетами на сентябрьский показ.

import { describe, it, expect } from 'vitest';
import { isBookingForShow, isKnownShow } from '../../shared/domain/performance.js';
import { bookingOccurrenceStartUtcMs, parseShowStartUtcMs, parisDateKey } from '../../shared/domain/showTime.js';
import { SHOWS, showStartUtcMs } from '../../shared/catalog/shows.js';

const SEPT = { showId: 'romantika', showDate: '17 Сен 2026', showTime: '20:00' };

describe('isBookingForShow', () => {
  it('билет на выбранный спектакль и его вечер — свой', () => {
    expect(isBookingForShow(SEPT, 'romantika')).toBe(true);
  });

  it('билет другого спектакля — чужой', () => {
    expect(isBookingForShow(SEPT, 'shutka')).toBe(false);
    expect(isBookingForShow({ showId: 'shutka', showDate: '02 Окт 2026', showTime: '20:00' }, 'romantika')).toBe(false);
  });

  it('другой вечер того же спектакля (перенос) — чужой', () => {
    expect(isBookingForShow({ ...SEPT, showDate: '14 Июн 2026', showTime: '19:00' }, 'romantika')).toBe(false);
  });

  it('момент, записанный при покупке (showStartAt), важнее строковой даты', () => {
    const june = parseShowStartUtcMs('14 Июн 2026', '19:00')!;
    expect(isBookingForShow({ ...SEPT, showStartAt: { seconds: june / 1000 } }, 'romantika')).toBe(false);
    const sept = showStartUtcMs(SHOWS.romantika!)!;
    expect(isBookingForShow({ showId: 'romantika', showStartAt: { toMillis: () => sept } }, 'romantika')).toBe(true);
  });

  it('неизвестный спектакль в запросе не совпадает ни с чем', () => {
    expect(isKnownShow('nope')).toBe(false);
    expect(isKnownShow('__proto__')).toBe(false);
    expect(isBookingForShow({ showId: 'nope' }, 'nope')).toBe(false);
  });

  it('у совсем старой брони без даты решает showId', () => {
    expect(bookingOccurrenceStartUtcMs({})).toBeNull();
    expect(isBookingForShow({ showId: 'romantika' }, 'romantika')).toBe(true);
    expect(isBookingForShow({ showId: 'romantika' }, 'shutka')).toBe(false);
  });
});

describe('identity сеанса: showId + день, а не точное время', () => {
  const catalog = SHOWS.romantika!; // 17 Сен 2026, 20:00
  const bookedAt = (time: string, date = '17 Сен 2026') => ({
    showId: 'romantika',
    showStartAt: { seconds: parseShowStartUtcMs(date, time)! / 1000 },
    showDate: date, showTime: time,
  });

  it('A. билет сеанса A работает на сеансе A', () => {
    expect(catalog.time).toBe('20:00');
    expect(isBookingForShow(bookedAt('20:00'), 'romantika')).toBe(true);
  });

  it('B. билет сеанса A не работает на сеансе B', () => {
    expect(isBookingForShow(bookedAt('20:00'), 'shutka')).toBe(false);
  });

  it('C. время сеанса поправили (19:00 → 20:00, 20:00 → 20:30) — проданный билет остаётся своим', () => {
    // Бронь купили, пока в каталоге стояло 19:00; сейчас каталог говорит 20:00.
    expect(isBookingForShow(bookedAt('19:00'), 'romantika')).toBe(true);
    expect(isBookingForShow(bookedAt('20:30'), 'romantika')).toBe(true);
  });

  it('C′. перенос на другой день — это уже другой сеанс', () => {
    expect(isBookingForShow(bookedAt('20:00', '16 Сен 2026'), 'romantika')).toBe(false);
    expect(isBookingForShow(bookedAt('20:00', '17 Сен 2025'), 'romantika')).toBe(false);
  });

  it('D. другой спектакль в тот же день и час — билет не принимается', () => {
    const sameEveningOtherShow = { ...bookedAt('20:00'), showId: 'shutka' };
    expect(isBookingForShow(sameEveningOtherShow, 'romantika')).toBe(false);
    // Похожее название ничего не решает — сравнивается только showId.
    expect(isBookingForShow({ ...bookedAt('20:00'), showId: 'romantika ' }, 'romantika')).toBe(false);
  });

  it('день считается по Парижу: поздний вечер не «переезжает» на следующий день по UTC', () => {
    expect(parisDateKey(parseShowStartUtcMs('17 Сен 2026', '23:30')!)).toBe('2026-09-17');
    expect(parisDateKey(parseShowStartUtcMs('01 Янв 2027', '00:30')!)).toBe('2027-01-01');
  });
});
