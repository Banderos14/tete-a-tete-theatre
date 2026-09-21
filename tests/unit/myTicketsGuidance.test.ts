// Зритель должен понимать, где его билет и что с ним делать.
//
// Главный путь — письмо: в нём QR и инструкция «покажите его на входе»,
// входить на сайт не нужно. Личный кабинет — дополнительный путь к тому же
// билету. И письмо, и экран успешной брони говорят это на обоих языках, без
// русских фраз во французском письме.

import { describe, it, expect } from 'vitest';
import { getAccountSectionFromLocation, ACCOUNT_DEEP_LINKS } from '../../src/utils/accountUrl.js';
import { myTicketsUrl } from '../../shared/domain/ticketCode.js';
import { getShowIdFromLocation } from '../../src/utils/showUrl.js';
import { buildTicketEmail, type TicketEmailBooking } from '../../shared/email/ticketEmail.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';

const loc = (search: string, hash: string) => ({ search, hash }) as Location;

const venue: TicketEmailBooking = {
  userName:      'Marie',
  showId:        'romantika',
  showTitle:     '«Романтика обреченности»',
  showDate:      '17 Сен 2026',
  showTime:      '20:00',
  ticketsCount:  1,
  seatsCount:    1,
  ticketType:    'standard',
  totalAmount:   15,
  ticketCode:    'ABCD-2345',
  status:        'pending',
  paymentMethod: 'on_site',
  paymentStatus: 'not_paid',
  lang:          'RU',
};
const paid: TicketEmailBooking = { ...venue, ticketsCount: 2, seatsCount: 2, totalAmount: 30,
  status: 'confirmed', paymentMethod: 'bank_transfer', paymentStatus: 'paid' };
const transfer: TicketEmailBooking = { ...venue, paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer' };

const mail = (b: TicketEmailBooking, kind: 'booking' | 'paid' = 'booking', withQr = true) =>
  buildTicketEmail(b, { kind, withQr });

describe('deep-link «Мои билеты»', () => {
  it('ссылка ведёт в кабинет, а не на главную', () => {
    expect(myTicketsUrl()).toMatch(/\/#\/\?account=tickets$/);
  });

  it('адрес разбирается и до решётки, и после неё', () => {
    expect(getAccountSectionFromLocation(loc('', '#/?account=tickets'))).toBe('tickets');
    expect(getAccountSectionFromLocation(loc('?account=tickets', '#/'))).toBe('tickets');
  });

  it('чужое значение параметра разделом не считается', () => {
    expect(getAccountSectionFromLocation(loc('', '#/?account=admin'))).toBeNull();
    expect(getAccountSectionFromLocation(loc('', '#/'))).toBeNull();
    expect(ACCOUNT_DEEP_LINKS).toEqual(['tickets']);
  });

  it('не ломает существующий ?show=', () => {
    const both = loc('', '#/?show=romantika&account=tickets');
    expect(getShowIdFromLocation(both)).toBe('romantika');
    expect(getAccountSectionFromLocation(both)).toBe('tickets');
  });

  it('ссылку в письме строит сервер от PUBLIC_SITE_URL, иначе — боевой домен', () => {
    expect(myTicketsUrl('https://preview.example.com/')).toBe('https://preview.example.com/#/?account=tickets');
    expect(myTicketsUrl('')).toBe('https://www.theatre-teteatete.fr/#/?account=tickets');
    expect(projectSource('server/email/ticketEmail.service.ts')).toContain("process.env.PUBLIC_SITE_URL");
  });

  it('неавторизованного сначала ведут на вход, потом в «Мои билеты»', () => {
    const gate = projectSource('src/app/AccountDeepLink.tsx');
    expect(gate).toContain('onRequireAuth');
    expect(gate).toContain('onOpenTickets');
    // Пока сессия не дорезолвилась, «не авторизован» ещё не факт.
    expect(gate).toContain('if (!pending || loading) return;');
  });

  it('кабинет открывается сразу на нужном разделе — новой страницы не появилось', () => {
    expect(projectSource('src/components/ui/ProfileDrawer/ProfileDrawer.tsx'))
      .toContain('initialSection');
    expect(projectSource('src/app/App.tsx')).toContain("openProfileAt('tickets')");
    // Роуты остались прежними: ?account= обслуживает существующий ProfileDrawer.
    expect(projectSource('src/app/App.tsx')).not.toContain('path="/account"');
  });
});

describe('письмо-билет: QR и что с ним делать', () => {
  it('RU: «ваш билет», QR и инструкция показать его на входе — без входа на сайт', () => {
    const { html, text } = mail(venue);
    expect(html).toContain('Ваш билет');
    expect(html).toContain('cid:ticket-qr');
    expect(html).toContain('Покажите этот QR-код сотруднику театра при входе.');
    expect(html).toContain('Show this QR code to the theatre staff at the entrance.');
    expect(html).toContain('Входить на сайт не нужно');
    expect(text).toContain('Покажите этот QR-код сотруднику театра при входе.');
  });

  it('данные спектакля, места, сумма и способ оплаты — в письме', () => {
    const { html } = mail({ ...venue, ticketsCount: 1, seatsCount: 3, ticketType: 'family', totalAmount: 45 });
    expect(html).toContain('17 Сен 2026');
    expect(html).toContain('20:00');
    expect(html).toMatch(/Мест[\s\S]{0,200}>\s*3\s*</);
    expect(html).toContain('Оплата на месте при входе: 45&nbsp;€');
  });

  it('кабинет — дополнительная кнопка «Открыть мои билеты»', () => {
    const { html, text } = mail(paid, 'paid');
    expect(html).toContain('Открыть мои билеты');
    expect(html).toMatch(/<a href="[^"]*account=tickets"/);
    expect(text).toContain('account=tickets');
  });

  it('письмо после оплаты — тоже полноценный билет', () => {
    const { html, subject } = mail(paid, 'paid');
    expect(subject).toContain('Оплата получена');
    expect(html).toContain('cid:ticket-qr');
    expect(html).toContain('Оплачено');
  });

  it('оплата на месте не выглядит оплаченным билетом, но QR есть', () => {
    const { html } = mail(venue);
    expect(html).toContain('cid:ticket-qr');
    expect(html).not.toContain('>Оплачено<');
    expect(html).toContain('Оплата — на входе');
  });

  it('перевод: реквизиты, 24 часа и тот же QR', () => {
    const { html } = mail(transfer);
    expect(html).toContain('ожидает оплаты');
    expect(html).toContain('24 часов');
    expect(html).toContain('IBAN');
    expect(html).toContain('cid:ticket-qr');
  });

  it('без картинки письмо остаётся полезным: код брони и подсказка', () => {
    const { html } = mail(venue, 'booking', false);
    expect(html).not.toContain('cid:ticket-qr');
    expect(html).toContain('ABCD-2345');
    expect(html).toContain('назовите на входе код брони');
    expect(html).toContain('Открыть мои билеты');
  });

  it('FR: тот же смысл по-французски, без кириллицы, название — французское', () => {
    const { subject, html, text } = mail({ ...paid, lang: 'FR' }, 'paid');
    expect(html).toContain('Présentez ce QR code au personnel du théâtre à l’entrée.');
    expect(html).toContain('Ouvrir mes billets');
    expect(subject).toContain('La Romanesque de la Fatalité');
    expect(subject).not.toMatch(/[А-Яа-яЁё]/);
    expect(html).not.toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('экран успешного бронирования', () => {
  const step = projectSource('src/components/ui/BookingModal/BookingSuccessStep.tsx');

  it('тексты берутся из i18n, а не зашиты по-русски', () => {
    expect(step).toContain('t.booking.successOnSite');
    expect(step).toContain('t.booking.successTransfer');
    expect(step).toContain('t.booking.myTickets');
  });

  it('есть кнопка в «Мои билеты»', () => {
    expect(step).toContain('onOpenTickets');
    expect(screenSource('src/components/ui/BookingModal')).toContain('onOpenTickets');
  });

  it('обе строки есть и в RU, и во FR', () => {
    const ru = projectSource('src/i18n/ru.ts');
    const fr = projectSource('src/i18n/fr.ts');
    for (const key of ['successOnSite', 'successTransfer', 'myTickets']) {
      expect(ru, `ru.${key}`).toContain(key);
      expect(fr, `fr.${key}`).toContain(key);
    }
    expect(fr).toContain('Mes billets');
    expect(ru).toContain('Мои билеты');
  });
});
