// Зритель должен понимать, где его QR и что с ним делать.
//
// Путь один: личный кабинет → «Мои билеты» → показать QR сотруднику. Значит
// и письмо, и экран успешного бронирования обязаны вести именно туда — и на
// обоих языках, без русских фраз во французском интерфейсе.

import { describe, it, expect } from 'vitest';
import { getMyTicketsUrl, getAccountSectionFromLocation, ACCOUNT_DEEP_LINKS } from '../../src/utils/accountUrl.js';
import { getShowIdFromLocation } from '../../src/utils/showUrl.js';
import { buildPaymentPaidEmail } from '../../src/services/email/templates/paymentPaid.js';
import { buildConfirmationEmail } from '../../src/services/email/templates/confirmation.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';
import type { PaymentPaidEmailData, BookingEmailData } from '../../src/services/email/types.js';

const loc = (search: string, hash: string) => ({ search, hash }) as Location;

const paidData: PaymentPaidEmailData = {
  userEmail:     'spectateur@example.com',
  userName:      'Marie',
  showId:        'romantika',
  showTitle:     '«Романтика обреченности»',
  showDate:      '17 Сен 2026',
  showTime:      '20:00',
  ticketsCount:  2,
  totalAmount:   30,
  ticketCode:    'ABCD-2345',
  bookingStatus: 'confirmed',
  lang:          'RU',
};

const bookingData: BookingEmailData = {
  userEmail:     'spectateur@example.com',
  userName:      'Marie',
  showId:        'romantika',
  showTitle:     '«Романтика обреченности»',
  showTitleFR:   '«La Romanesque de la Fatalité»',
  showDate:      '17 Сен 2026',
  showTime:      '20:00',
  ticketsCount:  1,
  ticketType:    'standard',
  totalAmount:   15,
  ticketCode:    'ABCD-2345',
  paymentMethod: 'on_site',
  lang:          'RU',
};

describe('deep-link «Мои билеты»', () => {
  it('ссылка ведёт в кабинет, а не на главную', () => {
    expect(getMyTicketsUrl()).toMatch(/\/#\/\?account=tickets$/);
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

  it('адрес письма строится от VITE_PUBLIC_SITE_URL, а не от прод-домена в коде', () => {
    const src = projectSource('src/utils/showUrl.ts');
    expect(src).toContain('VITE_PUBLIC_SITE_URL');
    // Адрес не собирается из литерала домена: база приходит из общей функции,
    // поэтому Preview-деплой присылает ссылки на себя, а не на прод.
    const account = projectSource('src/utils/accountUrl.ts');
    expect(account).toContain('getPublicSiteBase()');
    expect(account).not.toMatch(/return\s+`https:/);
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

describe('письмо об оплате ведёт в «Мои билеты»', () => {
  it('RU: подтверждение оплаты, QR в кабинете и кликабельная ссылка', () => {
    const { html, text } = buildPaymentPaidEmail(paidData);

    expect(html).toContain('Оплата подтверждена');
    expect(html).toContain('Мои билеты');
    expect(html).toContain('Открыть мои билеты');
    expect(html).toMatch(/<a href="[^"]*account=tickets"/);
    expect(text).toContain('account=tickets');
  });

  it('FR: тот же смысл по-французски, без русских фраз', () => {
    const { subject, html, text } = buildPaymentPaidEmail({ ...paidData, lang: 'FR' });

    expect(html).toContain('Mes billets');
    expect(html).toContain('Ouvrir mes billets');
    expect(html).toMatch(/<a href="[^"]*account=tickets"/);
    expect(text).toContain('account=tickets');

    // Никакой кириллицы во французском письме — включая название спектакля.
    expect(subject).not.toMatch(/[А-Яа-яЁё]/);
    expect(html).not.toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('FR-письмо называет спектакль по-французски', () => {
    const { subject } = buildPaymentPaidEmail({ ...paidData, lang: 'FR' });
    expect(subject).toContain('La Romanesque de la Fatalité');
  });
});

describe('письмо о бронировании объясняет, где QR', () => {
  it('RU on_site: QR в кабинете, оплата на месте', () => {
    const { html, text } = buildConfirmationEmail(bookingData);
    expect(html).toContain('Мои билеты');
    expect(html).toMatch(/<a href="[^"]*account=tickets"/);
    expect(text).toContain('Мои билеты');
  });

  it('RU bank_transfer: 24 часа, подтверждение после оплаты и оговорка про проход', () => {
    const { html } = buildConfirmationEmail({ ...bookingData, paymentMethod: 'bank_transfer' });

    expect(html).toContain('24 часов');
    expect(html).toContain('ожидает оплаты');
    expect(html).toContain('подтверждённой');
    // Неоплаченный QR НЕ объявляется действительным входным билетом.
    expect(html).toContain('билет должен быть оплачен');
  });

  it('FR bank_transfer: тот же смысл по-французски', () => {
    const { subject, html, text } = buildConfirmationEmail({
      ...bookingData, paymentMethod: 'bank_transfer', lang: 'FR',
    });

    expect(html).toContain('Mes billets');
    expect(html).toContain('24 heures');
    expect(html).toContain('le billet doit être payé');
    expect(subject).not.toMatch(/[А-Яа-яЁё]/);
    expect(html).not.toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('FR on_site: QR показывают на входе, оплата на месте', () => {
    const { html } = buildConfirmationEmail({ ...bookingData, lang: 'FR' });
    expect(html).toContain('Mes billets');
    expect(html).toContain('espèces');
    expect(html).not.toMatch(/[А-Яа-яЁё]/);
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
