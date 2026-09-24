// Несколько тарифов в одной брони — чистые правила корзины и показ состава.
//
// Цена корзины одна на сервер и форму (shared/domain/ticketBasket.ts), поэтому
// её проверяем здесь без Firestore; серверный путь (одна бронь, одна сессия
// Stripe, вместимость) — в onlineCheckout.test.ts.

import { describe, it, expect } from 'vitest';
import {
  priceBasket, catalogTariffs, canAddTicket, canRemoveTicket, setLineQuantity, clampBasket,
  bookingTicketLines, isMixedBooking, type BasketTariff,
} from '../../shared/domain/ticketBasket';
import { ticketBreakdownLabel } from '../../shared/catalog/ticketTypes';
import { SHOWS, MAX_TICKETS_PER_BOOKING } from '../../shared/catalog/shows';
import { buildTicketEmail, type TicketEmailBooking } from '../../shared/email/ticketEmail';
import { projectSource } from '../helpers/serverSource.js';

const SHUTKA = catalogTariffs(SHOWS.shutka!.tickets);     // standard 30 €, student 20 €
const KORABLIK = catalogTariffs(SHOWS.korablik!.tickets); // child 20, adult 15, family 45 (3 места)
const LIMITS = { maxTickets: MAX_TICKETS_PER_BOOKING, seatsLeft: null };

describe('цена корзины', () => {
  it('2 × Обычный 30 € + 2 × Ученик 20 € = 4 билета, 100 €', () => {
    const p = priceBasket(SHUTKA, [{ type: 'standard', quantity: 2 }, { type: 'student', quantity: 2 }], false);
    expect(p).toMatchObject({ ticketsCount: 4, seatsCount: 4, baseAmount: 100, discountAmount: 0, totalAmount: 100 });
    expect(p.items).toEqual([
      { type: 'standard', quantity: 2, unitPrice: 30, seats: 1, subtotal: 60 },
      { type: 'student',  quantity: 2, unitPrice: 20, seats: 1, subtotal: 40 },
    ]);
  });

  it('порядок строк — по каталогу, нули отбрасываются, повторы складываются', () => {
    const p = priceBasket(SHUTKA, [
      { type: 'student', quantity: 1 }, { type: 'standard', quantity: 0 }, { type: 'student', quantity: 1 },
    ], false);
    expect(p.items.map(i => [i.type, i.quantity])).toEqual([['student', 2]]);
  });

  it('семейный билет занимает три места: места ≠ билеты', () => {
    const p = priceBasket(KORABLIK, [{ type: 'family', quantity: 1 }, { type: 'child', quantity: 2 }], false);
    expect(p).toMatchObject({ ticketsCount: 3, seatsCount: 5, totalAmount: 85 });
  });

  it('неизвестный тариф — ошибка, а не «бесплатный» билет', () => {
    expect(() => priceBasket(SHUTKA, [{ type: 'family', quantity: 1 }], false)).toThrow();
  });

  it('бронь одного тарифа — те же суммы, что и раньше (price × count)', () => {
    for (const [, show] of Object.entries(SHOWS)) {
      for (const t of catalogTariffs(show.tickets)) {
        const p = priceBasket(catalogTariffs(show.tickets), [{ type: t.id, quantity: 3 }], false);
        expect(p.totalAmount).toBe(t.price * 3);
        expect(p.seatsCount).toBe(t.seats * 3);
      }
    }
  });
});

describe('лояльность в смешанной корзине', () => {
  it('скидка 50 % ровно на ОДИН билет — самый дорогой: 60 + 40 − 15 = 85 €', () => {
    const p = priceBasket(SHUTKA, [{ type: 'standard', quantity: 2 }, { type: 'student', quantity: 2 }], true);
    expect(p).toMatchObject({ baseAmount: 100, discountAmount: 15, discountTicketType: 'standard', totalAmount: 85 });
  });

  it('бронь одного тарифа — как раньше: floor(цена / 2) на один билет', () => {
    expect(priceBasket(SHUTKA, [{ type: 'standard', quantity: 2 }], true)).toMatchObject({ totalAmount: 45, discountAmount: 15 });
    expect(priceBasket(SHUTKA, [{ type: 'student',  quantity: 1 }], true)).toMatchObject({ totalAmount: 10, discountAmount: 10 });
    expect(priceBasket(KORABLIK, [{ type: 'adult', quantity: 1 }], true)).toMatchObject({ discountAmount: 7, totalAmount: 8 });
  });

  it('скидка не зависит от порядка строк в запросе и не применяется дважды', () => {
    const a = priceBasket(KORABLIK, [{ type: 'adult', quantity: 1 }, { type: 'family', quantity: 1 }], true);
    const b = priceBasket(KORABLIK, [{ type: 'family', quantity: 1 }, { type: 'adult', quantity: 1 }], true);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ discountAmount: 22, discountTicketType: 'family', totalAmount: 38 });
  });

  it('без награды скидки нет', () => {
    expect(priceBasket(SHUTKA, [{ type: 'standard', quantity: 2 }, { type: 'student', quantity: 2 }], false).discountTicketType).toBeNull();
  });
});

describe('форма: количество по тарифам', () => {
  const both = [{ type: 'standard' as const, quantity: 2 }, { type: 'student' as const, quantity: 2 }];

  it('изменение одного тарифа не сбрасывает количество другого (регрессия: было «выбрал студента — обычные исчезли»)', () => {
    let lines = setLineQuantity([], 'standard', 2);
    lines = setLineQuantity(lines, 'student', 1);
    lines = setLineQuantity(lines, 'student', 2);
    expect(priceBasket(SHUTKA, lines, false)).toMatchObject({ ticketsCount: 4, totalAmount: 100 });
    lines = setLineQuantity(lines, 'standard', 1);
    expect(lines.find(l => l.type === 'student')!.quantity).toBe(2);
  });

  it('0 — тариф не выбран; последний билет корзины убрать нельзя', () => {
    expect(canRemoveTicket(both, 'standard')).toBe(true);
    expect(canRemoveTicket([{ type: 'standard', quantity: 1 }], 'standard')).toBe(false);
    expect(canRemoveTicket([{ type: 'standard', quantity: 1 }], 'student')).toBe(false);
    expect(setLineQuantity(both, 'student', 0)).toEqual([{ type: 'standard', quantity: 2 }]);
  });

  it('сумма всех тарифов не превышает лимит брони', () => {
    const nine = [{ type: 'standard' as const, quantity: 5 }, { type: 'student' as const, quantity: MAX_TICKETS_PER_BOOKING - 5 }];
    expect(canAddTicket(SHUTKA, nine, 'standard', LIMITS)).toBe(false);
    expect(canAddTicket(SHUTKA, nine, 'student', LIMITS)).toBe(false);
  });

  it('сумма мест всех тарифов не превышает остаток зала', () => {
    expect(canAddTicket(SHUTKA, both, 'student', { maxTickets: 10, seatsLeft: 4 })).toBe(false);
    expect(canAddTicket(SHUTKA, both, 'student', { maxTickets: 10, seatsLeft: 5 })).toBe(true);
    // Семейный билет — три места.
    expect(canAddTicket(KORABLIK, [{ type: 'child', quantity: 1 }], 'family', { maxTickets: 10, seatsLeft: 3 })).toBe(false);
  });

  it('ограничение available тарифа сохраняется', () => {
    const limited: BasketTariff[] = [{ id: 'standard', price: 30, seats: 1, available: 2 }, { id: 'student', price: 20, seats: 1 }];
    expect(canAddTicket(limited, both, 'standard', LIMITS)).toBe(false);
    expect(canAddTicket(limited, both, 'student', LIMITS)).toBe(true);
  });

  it('мест стало меньше — корзина урезается, но хотя бы один билет остаётся', () => {
    expect(clampBasket(SHUTKA, both, { maxTickets: 10, seatsLeft: 3 })
      .reduce((s, l) => s + l.quantity, 0)).toBe(3);
    expect(clampBasket(SHUTKA, both, { maxTickets: 10, seatsLeft: 0 })
      .reduce((s, l) => s + l.quantity, 0)).toBe(1);
    expect(clampBasket(SHUTKA, both, LIMITS)).toEqual(both);
  });
});

describe('состав брони для показа', () => {
  it('новая бронь — из ticketItems; старая без него — ticketType × ticketsCount', () => {
    const mixed = { ticketType: 'standard', ticketsCount: 4, ticketItems: [
      { type: 'standard', quantity: 2, unitPrice: 30, seats: 1, subtotal: 60 },
      { type: 'student',  quantity: 2, unitPrice: 20, seats: 1, subtotal: 40 },
    ] };
    expect(bookingTicketLines(mixed).map(l => [l.type, l.quantity])).toEqual([['standard', 2], ['student', 2]]);
    expect(isMixedBooking(mixed)).toBe(true);
    expect(ticketBreakdownLabel(bookingTicketLines(mixed), 'RU')).toBe('2 × Обычный, 2 × Ученик / студент');
    expect(ticketBreakdownLabel(bookingTicketLines(mixed), 'FR')).toBe('2 × Plein tarif, 2 × Scolaire / étudiant');

    const legacy = { ticketType: 'standard', ticketsCount: 3 };
    expect(bookingTicketLines(legacy)).toEqual([{ type: 'standard', quantity: 3 }]);
    expect(isMixedBooking(legacy)).toBe(false);
    expect(ticketBreakdownLabel(bookingTicketLines(legacy), 'RU')).toBe('3 × Обычный');
  });

  it('повреждённый ticketItems не ломает показ — берётся старое описание', () => {
    expect(bookingTicketLines({ ticketType: 'student', ticketsCount: 2, ticketItems: [{ foo: 1 }] }))
      .toEqual([{ type: 'student', quantity: 2 }]);
    expect(bookingTicketLines({})).toEqual([{ type: '', quantity: 1 }]);
  });

  const emailBooking = (patch: Partial<TicketEmailBooking> = {}): TicketEmailBooking => ({
    userName: 'Anna', showId: 'shutka', showTitle: '«И в шутку, и всерьёз»', showDate: '02 Окт 2026', showTime: '20:00',
    ticketsCount: 4, seatsCount: 4, ticketType: 'standard', totalAmount: 100, ticketCode: 'ABCD-2345',
    status: 'confirmed', paymentMethod: 'online', paymentStatus: 'paid', lang: 'RU', ...patch,
  });

  it('письмо: состав по тарифам и итог — в HTML и в текстовой версии', () => {
    const mail = buildTicketEmail(emailBooking({ ticketItems: [
      { type: 'standard', quantity: 2, unitPrice: 30, seats: 1, subtotal: 60 },
      { type: 'student',  quantity: 2, unitPrice: 20, seats: 1, subtotal: 40 },
    ] }), { kind: 'paid', withQr: true, siteBase: 'https://x.test' });
    expect(mail.html).toContain('2 × Обычный<br>2 × Ученик / студент');
    expect(mail.html).toContain('100&nbsp;€');
    expect(mail.text).toContain('2 × Обычный, 2 × Ученик / студент');
  });

  it('письмо по старой брони — прежняя строка «N × тариф»', () => {
    const mail = buildTicketEmail(emailBooking({ ticketsCount: 2, totalAmount: 60 }), { kind: 'paid', withQr: true, siteBase: 'https://x.test' });
    expect(mail.html).toContain('2 × Обычный');
    expect(mail.html).not.toContain('<br>2 ×');
  });

  it('кабинет, QR-панель, PDF, админка и экран «бронь принята» берут состав из одного правила', () => {
    for (const file of [
      'src/components/ui/ProfileDrawer/BookingCard.tsx',
      'src/components/ui/TicketCard/TicketCard.tsx',
      'src/components/ui/TicketCard/TicketQrPanel.tsx',
    ]) expect(projectSource(file)).toContain('bookingBreakdown(b,');
    expect(projectSource('src/services/ticketPdfService.ts')).toContain('bookingTicketLines(booking)');
    expect(projectSource('src/pages/AdminPage/BookingsTab.tsx')).toContain('bookingTicketLines(b)');
    expect(projectSource('src/components/ui/BookingModal/BookingModal.tsx')).toContain('composition={ticketBreakdownLabel(price.items, lang)}');
    expect(projectSource('server/checkin/checkin.service.ts')).toContain('ticketBreakdownLabel(lines,');
  });
});
