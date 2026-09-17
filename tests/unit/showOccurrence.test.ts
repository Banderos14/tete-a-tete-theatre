// Билет привязан к СЕАНСУ, а не к спектаклю.
//
// Регрессия, ради которой написан файл: «Романтика обреченности» перенесена
// с 14.06.2026 19:00 на 17.09.2026 20:00, id спектакля остался прежним —
// romantika. Сканер считал актуальность билета по дате из КАТАЛОГА, поэтому
// вечером 17 сентября оплаченная июньская бронь выглядела сегодняшней и
// пропускалась в зал. Каталог отвечает «что играем сейчас», бронь —
// «на какой вечер продан билет»; для действительности билета верна вторая.

import { describe, it, expect } from 'vitest';
import {
  bookingOccurrenceStartUtcMs, parseShowStartUtcMs, showEndUtcMs, hasShowEnded,
} from '../../shared/domain/showTime.js';
import { SHOWS, showDateString, showStartUtcMs } from '../../shared/catalog/shows.js';
import { endpointSource, projectSource, screenSource, transactionBody } from '../helpers/serverSource.js';

const checkinApi = endpointSource('api/checkin-ticket.ts');
const scanScreen = screenSource('src/pages/TicketCheckPage');

// Бронь, купленная на июньский показ. Поля ровно те, что пишет сервер.
const JUNE_BOOKING = {
  showId:        'romantika',
  showTitle:     '«Романтика обреченности»',
  showDate:      '14 Июн 2026',
  showTime:      '19:00',
  status:        'confirmed',
  paymentStatus: 'paid',
  ticketsCount:  2,
};

// Момент, когда играет НОВЫЙ показ: 17 сентября 2026, 20:30 — зал уже сидит.
const DURING_SEPTEMBER_SHOW = parseShowStartUtcMs('17 Сен 2026', '20:30')!;

// Порог актуальности из checkin.service: двери открываются за 4 часа,
// билет принимается ещё 3 часа после окончания.
const DOORS_OPEN_BEFORE_MS = 4 * 60 * 60 * 1000;
const GRACE_AFTER_END_MS   = 3 * 60 * 60 * 1000;

/** Та же формула, что в relevanceOf, но над чистыми данными. */
function relevanceOf(booking: Record<string, unknown>, nowMs: number): string {
  const startMs = bookingOccurrenceStartUtcMs(booking);
  if (startMs === null) return 'unknown';
  if (nowMs < startMs - DOORS_OPEN_BEFORE_MS) return 'too_early';
  if (nowMs > showEndUtcMs(startMs) + GRACE_AFTER_END_MS) return 'too_late';
  return 'ok';
}

describe('старая июньская бронь не становится билетом на 17 сентября', () => {
  it('каталог и бронь действительно разошлись — сценарий воспроизведён', () => {
    expect(showDateString(SHOWS.romantika!)).toBe('17 Сен 2026');
    expect(JUNE_BOOKING.showDate).toBe('14 Июн 2026');
    expect(JUNE_BOOKING.showId).toBe('romantika');
  });

  it('сеанс брони — июньский вечер, а не сентябрьский показ из каталога', () => {
    expect(bookingOccurrenceStartUtcMs(JUNE_BOOKING))
      .toBe(parseShowStartUtcMs('14 Июн 2026', '19:00'));
    expect(bookingOccurrenceStartUtcMs(JUNE_BOOKING))
      .not.toBe(showStartUtcMs(SHOWS.romantika!));
  });

  it('во время сентябрьского показа июньский билет недействителен', () => {
    expect(relevanceOf(JUNE_BOOKING, DURING_SEPTEMBER_SHOW)).toBe('too_late');
  });

  it('расчёт по каталогу дал бы «ok» — это и была дыра', () => {
    const byCatalog = showStartUtcMs(SHOWS.romantika!)!;
    expect(hasShowEnded(byCatalog, DURING_SEPTEMBER_SHOW)).toBe(false);
    // Показываем разницу явно: одна и та же бронь, два источника даты.
    expect(relevanceOf(JUNE_BOOKING, DURING_SEPTEMBER_SHOW)).not.toBe('ok');
  });

  it('сервер отказывает в проходе сам, а не только прячет кнопку', () => {
    expect(checkinApi).toContain("refusal: 'show_over'");
    expect(checkinApi).toMatch(/booking\.showRelevance === 'too_late'/);
    // Отказ стоит внутри транзакции — до записи статуса attended.
    const tx = transactionBody(projectSource('server/checkin/checkin.service.ts'));
    expect(tx.indexOf("refusal: 'show_over'")).toBeGreaterThan(-1);
    expect(tx.indexOf("refusal: 'show_over'")).toBeLessThan(tx.indexOf('attendedTransition('));
  });

  it('по июньскому билету нельзя принять и оплату на входе', () => {
    // Половинчатая защита хуже целой: деньги взяли, бронь перевели в confirmed,
    // а в зал всё равно не пускают. Оба действия закрыты одной причиной.
    const markPaid = checkinApi.slice(checkinApi.indexOf('// mark_paid'));
    expect(markPaid).toContain("refusal: 'show_over'");
    expect(markPaid).toMatch(/booking\.showRelevance === 'too_late'/);
    // Отказ стоит до записи оплаты.
    expect(markPaid.indexOf('paidTransition(')).toBeGreaterThan(-1);
    expect(markPaid.indexOf("refusal: 'show_over'"))
      .toBeLessThan(markPaid.indexOf('paidTransition('));
  });

  it('оба изменяющих действия проверяют сеанс, inspect — нет', () => {
    // inspect обязан вернуть снимок даже по мёртвому билету: именно из него
    // сканер рисует карточку «Билет на прошедший спектакль».
    expect(checkinApi.match(/booking\.showRelevance === 'too_late'/g)).toHaveLength(2);
    const inspect = checkinApi.slice(
      checkinApi.indexOf("if (action === 'inspect')"),
      checkinApi.indexOf("if (action === 'mark_attended')"),
    );
    expect(inspect).not.toContain('show_over');
  });

  it('сканер объясняет отказ сотруднику и на проходе, и на оплате', () => {
    expect(scanScreen).toContain('проход отмечать нельзя');
    expect(scanScreen).toContain('оплату принимать нельзя');
  });

  it('сканер показывает июньский билет недействительным и с его собственной датой', () => {
    expect(scanScreen).toContain("showRelevance === 'too_late'");
    expect(scanScreen).toContain('Билет на прошедший спектакль');
    expect(scanScreen).toContain('show_over');
  });

  it('перенос объяснён отдельным признаком, а не выглядит сбоем сканера', () => {
    // Спектакль с этим id сегодня идёт — сотрудник должен понимать, почему
    // билет всё равно не годится.
    expect(checkinApi).toContain('catalogDateDiffers');
    expect(scanScreen).toContain('Бронь на другую дату спектакля');
  });
});

describe('новая бронь на 17 сентября работает как обычно', () => {
  const SEPT_BOOKING = {
    showId:        'romantika',
    showDate:      '17 Сен 2026',
    showTime:      '20:00',
    status:        'confirmed',
    paymentStatus: 'paid',
    ticketsCount:  2,
  };

  it('сеанс брони совпадает с каталогом — расхождения нет', () => {
    expect(bookingOccurrenceStartUtcMs(SEPT_BOOKING)).toBe(showStartUtcMs(SHOWS.romantika!));
    expect(SEPT_BOOKING.showDate).toBe(showDateString(SHOWS.romantika!));
  });

  it('на своём показе билет действителен', () => {
    expect(relevanceOf(SEPT_BOOKING, DURING_SEPTEMBER_SHOW)).toBe('ok');
  });

  it('за 2 часа до начала уже пускают, за сутки — ещё нет', () => {
    const start = bookingOccurrenceStartUtcMs(SEPT_BOOKING)!;
    expect(relevanceOf(SEPT_BOOKING, start - 2 * 60 * 60 * 1000)).toBe('ok');
    expect(relevanceOf(SEPT_BOOKING, start - 24 * 60 * 60 * 1000)).toBe('too_early');
  });

  it('на июньском вечере сентябрьский билет ещё не действует', () => {
    expect(relevanceOf(SEPT_BOOKING, parseShowStartUtcMs('14 Июн 2026', '19:00')!)).toBe('too_early');
  });

  it('через сутки после своего показа билет уже не действует', () => {
    const start = bookingOccurrenceStartUtcMs(SEPT_BOOKING)!;
    expect(relevanceOf(SEPT_BOOKING, start + 24 * 60 * 60 * 1000)).toBe('too_late');
  });
});

describe('снимок сеанса переживает перенос спектакля', () => {
  it('showStartAt важнее строковой даты — момент зафиксирован в момент покупки', () => {
    const june = parseShowStartUtcMs('14 Июн 2026', '19:00')!;
    // Firestore Timestamp приходит объектом с toMillis(); поддержан и сырой вид.
    expect(bookingOccurrenceStartUtcMs({ showStartAt: { toMillis: () => june } })).toBe(june);
    expect(bookingOccurrenceStartUtcMs({ showStartAt: { seconds: june / 1000 } })).toBe(june);
  });

  it('сервер записывает showStartAt при создании брони', () => {
    expect(endpointSource('api/create-booking.ts')).toContain('showStartAt:');
    expect(endpointSource('api/create-booking.ts')).toContain('showDate,');
  });

  it('у брони без даты вовсе момент неизвестен — билет не «сегодняшний» по умолчанию', () => {
    expect(bookingOccurrenceStartUtcMs({})).toBeNull();
    expect(relevanceOf({ showId: 'romantika' }, DURING_SEPTEMBER_SHOW)).toBe('unknown');
  });

  it('кабинет и сканер считают конец сеанса одной функцией', () => {
    // Иначе билет «активен» в личном кабинете и просрочен на входе.
    expect(endpointSource('api/checkin-ticket.ts')).toContain('bookingOccurrenceStartUtcMs');
    expect(screenSource('src/services')).toContain('bookingOccurrenceStartUtcMs');
  });
});
