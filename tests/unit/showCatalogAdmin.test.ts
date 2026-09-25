// Один каталог спектаклей для сайта, админки и сканера; касса админки.

import { describe, it, expect } from 'vitest';
import { SHOWS as FRONT_SHOWS, PUBLISHED_SHOWS } from '../../src/data/shows';
import { SHOWS, DRAFT_SHOWS, SEASON_CATALOG } from '../../shared/catalog/shows';
import { adminShowList, summarizeByShow, summarizeBookings, netPaidAmount, refundedAmount } from '../../src/pages/AdminPage/adminStats';
import { checkinShowOptions } from '../../src/pages/TicketCheckPage/checkinShows';
import { isBookingForShow, isKnownShow } from '../../shared/domain/performance';
import type { Booking } from '../../src/types/booking';

const bk = (p: Partial<Booking>): Booking => ({
  id: Math.random().toString(36).slice(2), showId: 'shutka', showTitle: '«И в шутку, и всерьёз»',
  showDate: '02 Окт 2026', showTime: '20:00', userId: 'u', userName: 'A', userEmail: 'a@b.c', userPhone: '',
  ticketsCount: 1, seatsCount: 1, ticketType: 'standard', priceInfo: '', totalAmount: 30, ticketCode: 'ABCD-2345',
  status: 'confirmed', paymentMethod: 'on_site', paymentStatus: 'paid', comment: '', lang: 'RU', ...p,
} as Booking);

describe('«Летучий корабль»: заготовка в каталоге, а не активный спектакль', () => {
  it('в каталоге он есть, но не опубликован — на сайте, в продаже и в сканере его нет', () => {
    expect(SEASON_CATALOG.letuchiy!.published).toBe(false);
    expect(DRAFT_SHOWS).toHaveProperty('letuchiy');
    expect(SHOWS).not.toHaveProperty('letuchiy');
    expect(PUBLISHED_SHOWS.map(s => s.id)).not.toContain('letuchiy');
    expect(checkinShowOptions().map(o => o.id)).not.toContain('letuchiy');
    expect(isKnownShow('letuchiy')).toBe(false);
  });

  it('админка не показывает пустую карточку заготовки', () => {
    expect(adminShowList(FRONT_SHOWS, []).map(s => s.id)).not.toContain('letuchiy');
  });
});

describe('админка: спектакли — те же, что на сайте', () => {
  it('без броней — ровно опубликованные спектакли сайта, в порядке каталога', () => {
    expect(adminShowList(FRONT_SHOWS, []).map(s => s.id)).toEqual(PUBLISHED_SHOWS.map(s => s.id));
  });

  it('заготовка с бронями (старые данные) появляется — брони не теряются', () => {
    const list = adminShowList(FRONT_SHOWS, [bk({ showId: 'letuchiy', showTitle: '«Летучий корабль»' })]);
    expect(list.map(s => s.id)).toContain('letuchiy');
  });

  it('спектакль, удалённый из каталога, восстанавливается по снимку брони', () => {
    const old = bk({ showId: 'nulin', showTitle: '«Граф Нулин»', showDate: '29 Май 2026', showTime: '19:00', ticketsCount: 2, seatsCount: 2, totalAmount: 40 });
    const list  = adminShowList(FRONT_SHOWS, [old]);
    const nulin = list.find(s => s.id === 'nulin')!;
    expect(nulin).toMatchObject({ title: '«Граф Нулин»', dateLabel: '29 Май 2026 · 19:00', capacity: 50 });
    expect(nulin.image).toBeUndefined();
    const stats = summarizeByShow(list, [old]).find(s => s.show.id === 'nulin')!;
    expect(stats).toMatchObject({ bookings: 1, tickets: 2, revenue: 40 });
  });

  it('у карточки — постер сайта, дата показа и вместимость зала', () => {
    const shutka = adminShowList(FRONT_SHOWS, []).find(s => s.id === 'shutka')!;
    expect(shutka.image).toBe(FRONT_SHOWS.find(s => s.id === 'shutka')!.image);
    expect(shutka.dateLabel).toBe('02 Окт 2026 · 20:00');
    expect(shutka.capacity).toBe(50);
  });

  it('бронь попадает к спектаклю по showId, а не по названию', () => {
    const renamed = bk({ showId: 'shutka', showTitle: 'Старое название' });
    const stats = summarizeByShow(adminShowList(FRONT_SHOWS, [renamed]), [renamed]);
    expect(stats.find(s => s.show.id === 'shutka')!.bookings).toBe(1);
    expect(stats.map(s => s.show.id)).not.toContain('Старое название');
  });
});

describe('касса и сводка админки', () => {
  it('оплачено — только полученные и не возвращённые деньги', () => {
    expect(netPaidAmount(bk({ paymentStatus: 'paid', totalAmount: 60 }))).toBe(60);
    expect(netPaidAmount(bk({ paymentStatus: 'paid', status: 'cancelled', totalAmount: 60 }))).toBe(60);
    for (const paymentStatus of ['not_paid', 'awaiting_transfer', 'awaiting_online', 'expired', 'refunded'] as const) {
      expect(netPaidAmount(bk({ paymentStatus, totalAmount: 60 })), paymentStatus).toBe(0);
    }
  });

  it('частичный возврат Stripe вычитается (регрессия: шёл в кассу целиком)', () => {
    const partial = bk({ paymentMethod: 'online', paymentStatus: 'paid', totalAmount: 60,
      refunds: { re_a: { status: 'succeeded', amountCents: 1000 }, re_b: { status: 'pending', amountCents: 500 } } });
    expect(refundedAmount(partial)).toBe(10);
    expect(netPaidAmount(partial)).toBe(50);
    // Старая бронь без реестра — одно поле refund.
    expect(refundedAmount(bk({ refund: { id: 're', status: 'succeeded', amount: 15, updatedAtMs: 0 } }))).toBe(15);
    expect(refundedAmount(bk({ refund: { id: 're', status: 'failed', amount: 15, updatedAtMs: 0 } }))).toBe(0);
  });

  it('брони — активные записи; места — сумма мест (смешанная корзина и семейный билет)', () => {
    const list = [
      bk({ ticketsCount: 4, seatsCount: 4, totalAmount: 100 }),                     // 2 обычных + 2 студенческих
      bk({ showId: 'korablik', ticketsCount: 2, seatsCount: 4, totalAmount: 65 }),  // семейный + детский
      bk({ status: 'cancelled', paymentStatus: 'not_paid', ticketsCount: 3, seatsCount: 3, totalAmount: 90 }),
      bk({ paymentStatus: 'awaiting_online', status: 'pending', ticketsCount: 1, seatsCount: 1, totalAmount: 30 }),
    ];
    expect(summarizeBookings(list)).toEqual({ bookings: 3, tickets: 9, revenue: 165 });
  });
});

describe('сканер: список спектаклей и сопоставление билета', () => {
  it('в сканере — ровно опубликованные спектакли, по времени начала', () => {
    const ids = checkinShowOptions().map(o => o.id);
    expect(ids.slice().sort()).toEqual(Object.keys(SHOWS).sort());
  });

  it('билет проходит только на свой спектакль (showId + день показа)', () => {
    const b = { showId: 'shutka', showDate: '02 Окт 2026', showTime: '20:00' };
    expect(isBookingForShow(b, 'shutka')).toBe(true);
    expect(isBookingForShow(b, 'razgovor')).toBe(false);
    expect(isBookingForShow({ ...b, showDate: '03 Окт 2026' }, 'shutka')).toBe(false);
    // Заготовку выбрать нельзя — и билет на неё не проходит.
    expect(isBookingForShow({ showId: 'letuchiy', showDate: '21 Ноя 2026', showTime: '19:00' }, 'letuchiy')).toBe(false);
  });
});

describe('карточка спектакля в админке', () => {
  it('число броней склоняется: 1 бронирование, 2 бронирования, 5 бронирований', async () => {
    const { RU } = await import('../../src/i18n/ru');
    expect([0, 1, 2, 4, 5, 11, 21, 22].map(RU.admin.bookingsCount)).toEqual([
      '0 бронирований', '1 бронирование', '2 бронирования', '4 бронирования', '5 бронирований',
      '11 бронирований', '21 бронирование', '22 бронирования',
    ]);
  });

  it('карточка показывает дату показа и места из вместимости зала', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { AdminShowCard } = await import('../../src/pages/AdminPage/AdminShowCard');
    const list  = adminShowList(FRONT_SHOWS, []);
    const stats = summarizeByShow(list, [bk({ ticketsCount: 2, seatsCount: 2, totalAmount: 60 })]).find(s => s.show.id === 'shutka')!;
    const html  = renderToStaticMarkup(createElement(AdminShowCard, { stats, active: false, onToggle: () => {} }));
    expect(html).toContain('02 Окт 2026 · 20:00');
    expect(html.replace(/\u00a0/g, ' ')).toContain('1 бронирование · 2 / 50 мест · 60 € оплачено');
  });
});
