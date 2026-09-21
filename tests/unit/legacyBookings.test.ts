// Старые брони — поиск у входа и проверка билета, только на чтение.
//
// Схема старых броней взята из истории проекта, а не придумана: версия
// 08.06–25.06.2026 (коммит a607893, клиентское создание брони) писала те же
// userName / userEmail / userPhone / showId / ticketCode, но без seatsCount,
// showStartAt и lang. В боевых данных на 22.09.2026 таких полей нет у части
// броней (seatsCount — у 4 из 13), есть бронь на спектакль, снятый с афиши
// (nulin), и июньская «Романтика» — другой день того же showId.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterBookings } from '../../src/utils/bookingSearch';
import { screenSource } from '../helpers/serverSource.js';

/** Бронь в формате версии a607893 (без seatsCount, showStartAt, lang). */
const legacy = {
  id: 'legacy-1',
  showId: 'romantika', showTitle: '«Романтика обреченности»', showDate: '14 Июн 2026', showTime: '19:00',
  userId: 'u-old', userName: 'Мария Иванова', userEmail: 'maria.ivanova@example.com', userPhone: '+33612345678',
  ticketsCount: 2, ticketType: 'standard', priceInfo: '', totalAmount: 30, ticketCode: 'RU3R-HZJF',
  status: 'attended', paymentMethod: 'on_site', paymentStatus: 'paid', comment: '',
};
const current = {
  ...legacy, id: 'new-1', showDate: '02 Окт 2026', showTime: '20:00', showId: 'shutka',
  userName: 'Pierre Durand', userEmail: 'pierre@example.fr', userPhone: '+33 7 11 22 33 44',
  ticketCode: 'PKX3-E222', seatsCount: 2, lang: 'FR', status: 'pending', paymentStatus: 'not_paid',
};
const list = [legacy, current];

describe('поиск находит старые брони так же, как новые', () => {
  it('по коду — с дефисом и без, в любом регистре', () => {
    for (const q of ['RU3R-HZJF', 'ru3rhzjf', ' ru3r-hzjf ']) {
      expect(filterBookings(list, q).map(b => b.id), q).toEqual(['legacy-1']);
    }
  });

  it('по e-mail — без учёта регистра', () => {
    expect(filterBookings(list, 'MARIA.IVANOVA@').map(b => b.id)).toEqual(['legacy-1']);
  });

  it('по имени и по телефону в другом формате', () => {
    expect(filterBookings(list, 'иванова мария').map(b => b.id)).toEqual(['legacy-1']);
    expect(filterBookings(list, '06 12 34 56').map(b => b.id)).toEqual(['legacy-1']);
  });

  it('новая бронь продолжает находиться', () => {
    expect(filterBookings(list, 'pkx3e222').map(b => b.id)).toEqual(['new-1']);
    expect(filterBookings(list, '07 11 22').map(b => b.id)).toEqual(['new-1']);
  });

  it('поиск — чистая функция: не меняет брони', () => {
    const snapshot = JSON.stringify(list);
    filterBookings(list, 'maria');
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe('панель поиска у входа: только чтение', () => {
  const panel = screenSource('src/pages/TicketCheckPage').slice(0);

  it('можно искать во всех спектаклях — и снятых с афиши, и прошедших', () => {
    expect(panel).toContain('getAllBookings(allShows ? {} : { showId })');
    expect(panel).toContain('Искать во всех спектаклях');
  });

  it('поиск не пишет в базу и не отправляет писем', () => {
    const src = screenSource('src/pages/TicketCheckPage');
    const searchPanel = src.slice(src.indexOf('// Поиск зрителя без QR'), src.indexOf('export function BookingSearchPanel'));
    expect(searchPanel.length).toBeGreaterThan(0);
    for (const forbidden of ['resend_ticket', 'sendBookingEmail', 'updateDoc', 'setDoc', 'adminBookingMutation']) {
      expect(src.slice(src.indexOf('// Поиск зрителя без QR')), forbidden).not.toContain(forbidden);
    }
  });

  it('бронь без кода видна, но не открывается через сервер', () => {
    expect(panel).toContain('disabled={!b.ticketCode}');
  });
});

// Проверка на входе: старая бронь читается сервером, данные не меняются.
let store: Record<string, unknown> = {};
const writes: unknown[] = [];
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => '<ts>' } }));
vi.mock('../../server/booking/booking.repository.js', () => ({
  db: () => ({
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ update: (_r: unknown, d: unknown) => { writes.push(d); } }),
  }),
  findByTicketCode: async () => ({ ref: {}, id: 'legacy-1', data: store }),
}));
const { checkinTicket } = await import('../../server/checkin/checkin.service.js');

describe('сервер понимает старую бронь', () => {
  beforeEach(() => { store = { ...legacy }; writes.length = 0; });

  it('скан старой брони показывает её без записи; места — из ticketsCount', async () => {
    const res = await checkinTicket({ adminUid: 'a', ticketCode: 'RU3R-HZJF', action: 'inspect', showId: 'romantika' });
    expect(res.booking).toMatchObject({ userName: 'Мария Иванова', seatsCount: 2, lang: 'RU' });
    expect(writes).toEqual([]);
  });

  it('июньский билет на нынешнюю «Романтику» — другой спектакль, проход не отмечается', async () => {
    store = { ...legacy, status: 'confirmed' };
    const res = await checkinTicket({ adminUid: 'a', ticketCode: 'RU3R-HZJF', action: 'inspect', showId: 'romantika' });
    expect(res.booking.wrongShow).toBe(true);
    await expect(checkinTicket({ adminUid: 'a', ticketCode: 'RU3R-HZJF', action: 'mark_attended', showId: 'romantika' }))
      .rejects.toMatchObject({ reason: 'wrong_show' });
    expect(writes).toEqual([]);
  });
});
