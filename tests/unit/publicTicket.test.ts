// Публичная страница билета: открывается из письма в любом браузере без входа.

import { describe, it, expect, vi } from 'vitest';
import QRCode from 'qrcode';
import { publicTicketUrl, ticketQrPayload, myTicketsUrl } from '../../shared/domain/ticketCode.js';
import { buildTicketEmail } from '../../shared/email/ticketEmail.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';

const page = screenSource('src/pages/TicketPage');
const CODE = 'PKX3-E222';

describe('публичная страница билета', () => {
  it('маршрут /ticket зарегистрирован и под границей ошибок', () => {
    const app = projectSource('src/app/App.tsx');
    expect(app).toContain('path="/ticket"');
    expect(app).toContain('<ErrorBoundary label="TicketPage"');
    expect(app.indexOf('path="/ticket"')).toBeLessThan(app.indexOf('path="*"'));
  });

  it('не зависит от авторизации и не читает базу', () => {
    for (const forbidden of ['useAuth', 'firebase/', 'getIdToken', 'getAllBookings', 'fetch(', '/api/']) {
      expect(page, forbidden).not.toContain(forbidden);
    }
  });

  it('не показывает персональные данные и не даёт менять бронь', () => {
    for (const field of ['userEmail', 'userPhone', 'userName', 'totalAmount', 'paymentStatus']) {
      expect(page, field).not.toContain(field);
    }
  });

  it('QR строится той же функцией, что в кабинете, PDF и письме', async () => {
    expect(page).toContain('generateTicketQR(code)');
    const spy = vi.spyOn(QRCode, 'toDataURL');
    const { generateTicketQR } = await import('../../src/services/qrService');
    await generateTicketQR(CODE);
    expect(spy.mock.calls[0]![0]).toBe(ticketQrPayload(CODE));
    spy.mockRestore();
  });

  it('ссылка на кабинет — полная загрузка, чтобы кабинет действительно открылся', () => {
    expect(page).toContain('href="/?account=tickets"');
    expect(page).not.toContain('href="#/?account=tickets"');
  });

  it('кривой код в ссылке не превращается в чужой билет', () => {
    expect(page).toContain("normalizeTicketCodeInput(params.get('code')");
  });
});

describe('ссылка из письма', () => {
  it('ведёт на публичную страницу с кодом и языком брони', () => {
    expect(publicTicketUrl(CODE, 'https://www.theatre-teteatete.fr/', 'FR'))
      .toBe('https://www.theatre-teteatete.fr/#/ticket?code=PKX3-E222&lang=FR');
    expect(publicTicketUrl(CODE)).toBe('https://www.theatre-teteatete.fr/#/ticket?code=PKX3-E222');
  });

  it('письмо ставит её главной кнопкой', () => {
    const { html } = buildTicketEmail({
      userName: 'A', showId: 'shutka', showTitle: 'T', showDate: '02 Окт 2026', showTime: '20:00',
      ticketsCount: 1, ticketType: 'standard', totalAmount: 30, ticketCode: CODE,
      status: 'pending', paymentMethod: 'on_site', paymentStatus: 'not_paid', lang: 'RU',
    }, { kind: 'booking', withQr: true });
    expect(html).toContain(publicTicketUrl(CODE, undefined, 'RU'));
    expect(html).toContain(myTicketsUrl());
  });

  it('кабинет по-прежнему требует входа — AccountDeepLink ведёт на вход', () => {
    const gate = projectSource('src/app/AccountDeepLink.tsx');
    expect(gate).toContain('onRequireAuth');
  });
});
