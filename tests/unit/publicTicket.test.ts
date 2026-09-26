// Публичная страница билета: письмо, PDF и QR ведут на неё, и она открывается
// в любом браузере без входа (Gmail на iPhone часто открывает ссылку в Chrome,
// а зритель входил в Safari — сессии Firebase там нет).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import QRCode from 'qrcode';
import {
  publicTicketUrl, ticketQrPayload, myTicketsUrl, CANONICAL_SITE_URL,
} from '../../shared/domain/ticketCode.js';
import {
  buildTicketEmail, buildCancellationEmail, type TicketEmailBooking, type TicketEmailKind,
} from '../../shared/email/ticketEmail.js';
import { publicTicketState, toPublicTicket } from '../../shared/domain/publicTicket.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';

const page = screenSource('src/pages/TicketPage');
const CODE = 'PKX3-E222';
const SITE = 'https://www.theatre-teteatete.fr';

const mailBooking = (patch: Partial<TicketEmailBooking> = {}): TicketEmailBooking => ({
  userName: 'A', showId: 'shutka', showTitle: 'T', showDate: '02 Окт 2026', showTime: '20:00',
  ticketsCount: 1, ticketType: 'standard', totalAmount: 30, ticketCode: CODE,
  status: 'confirmed', paymentMethod: 'online', paymentStatus: 'paid', lang: 'RU',
  ...patch,
});

/** Все href письма. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]!);

// ── Ссылка ─────────────────────────────────────────────────────────────────

describe('канонический адрес билета', () => {
  it('код, язык и базовый адрес сайта', () => {
    expect(publicTicketUrl(CODE, `${SITE}/`, 'FR')).toBe(`${SITE}/#/ticket?code=PKX3-E222&lang=FR`);
    expect(publicTicketUrl(CODE, SITE, 'RU')).toBe(`${SITE}/#/ticket?code=PKX3-E222&lang=RU`);
    expect(publicTicketUrl(CODE)).toBe(`${SITE}/#/ticket?code=PKX3-E222`);
  });

  it('без PUBLIC_SITE_URL — боевой домен, а не preview', () => {
    expect(publicTicketUrl(CODE, '', 'RU').startsWith(`${CANONICAL_SITE_URL}/#/ticket`)).toBe(true);
    expect(CANONICAL_SITE_URL).toBe(SITE);
  });

  it('сервер берёт базу из PUBLIC_SITE_URL, по умолчанию — канонический домен', async () => {
    const { publicSiteUrl } = await import('../../server/email/ticketEmail.service.js');
    vi.stubEnv('PUBLIC_SITE_URL', '');
    expect(publicSiteUrl()).toBe(SITE);
    vi.stubEnv('PUBLIC_SITE_URL', 'https://staging.example.com');
    expect(publicSiteUrl()).toBe('https://staging.example.com');
    vi.unstubAllEnvs();
    // И эта база реально уходит в оба шаблона.
    const svc = projectSource('server/email/ticketEmail.service.ts');
    expect(svc).toContain('const siteBase = publicSiteUrl();');
    expect(svc).toContain('buildCancellationEmail(booking, siteBase)');
    expect(svc).toContain('buildTicketEmail(booking, { kind: trigger, withQr, siteBase })');
  });
});

// ── Письма ─────────────────────────────────────────────────────────────────

describe('письма ведут на конкретный билет, а не в кабинет', () => {
  const kinds: TicketEmailKind[] = ['booking', 'paid', 'resend'];

  it.each(kinds)('%s: главная кнопка — публичный билет (RU)', kind => {
    const { html, text } = buildTicketEmail(mailBooking(), { kind, withQr: true, siteBase: SITE });
    const url = publicTicketUrl(CODE, SITE, 'RU');
    expect(hrefs(html)).toContain(url);
    expect(html).toContain('Открыть билет');
    expect(text).toContain(`Открыть билет: ${url}`);
    // Кабинет остаётся второстепенной ссылкой — ниже главной кнопки.
    expect(html.indexOf(url)).toBeLessThan(html.indexOf(myTicketsUrl(SITE)));
  });

  it.each(kinds)('%s: язык брони FR сохраняется в ссылке', kind => {
    const { html } = buildTicketEmail(mailBooking({ lang: 'FR' }), { kind, withQr: false, siteBase: SITE });
    expect(hrefs(html)).toContain(`${SITE}/#/ticket?code=PKX3-E222&lang=FR`);
    expect(html).toContain('Ouvrir le billet');
  });

  it('письмо об отмене — на публичную страницу брони, не в кабинет', () => {
    const ru = buildCancellationEmail(mailBooking({ status: 'cancelled' }), SITE);
    expect(hrefs(ru.html)).toContain(publicTicketUrl(CODE, SITE, 'RU'));
    expect(ru.html).not.toContain('account=tickets');
    expect(ru.html).toContain('Посмотреть бронь');
    expect(ru.text).toContain(publicTicketUrl(CODE, SITE, 'RU'));

    const fr = buildCancellationEmail(mailBooking({ status: 'cancelled', lang: 'FR' }), SITE);
    expect(hrefs(fr.html)).toContain(publicTicketUrl(CODE, SITE, 'FR'));
    expect(fr.html).toContain('Voir la réservation');
  });

  it('письмо о возврате — та же ссылка и текст о возврате', () => {
    const mail = buildCancellationEmail(mailBooking({ status: 'cancelled', refunded: true }), SITE);
    expect(hrefs(mail.html)).toContain(publicTicketUrl(CODE, SITE, 'RU'));
    expect(mail.html).toContain('5–10 рабочих дней');
    expect(mail.html).not.toContain('account=tickets');
  });

  it('ни одно письмо о брони не ведёт на preview Vercel', () => {
    const { html } = buildTicketEmail(mailBooking(), { kind: 'paid', withQr: true });
    expect(html).not.toMatch(/vercel\.app/);
    expect(hrefs(html)).toContain(publicTicketUrl(CODE, SITE, 'RU'));
  });
});

// ── PDF ───────────────────────────────────────────────────────────────────

describe('PDF-билет', () => {
  const pdfText = async (lang: 'RU' | 'FR') => {
    const { buildTicketPdf } = await import('../../src/services/ticketPdfService.js');
    const { generateTicketQR } = await import('../../src/services/qrService.js');
    const booking = {
      id: 'b1', showId: 'shutka', showTitle: 'Спектакль', showDate: '17 Май 2026', showTime: '19:30',
      userId: 'u1', userName: 'Ivan', userEmail: 'i@example.com', userPhone: '', ticketsCount: 1,
      ticketType: 'standard', priceInfo: '', totalAmount: 30, ticketCode: CODE, status: 'confirmed',
      paymentMethod: 'on_site', paymentStatus: 'not_paid', comment: '', createdAt: {},
    } as never;
    const pdf = await buildTicketPdf(booking, await generateTicketQR(CODE), lang);
    return Buffer.from(await pdf.blob.arrayBuffer()).toString('latin1');
  };

  it.each(['FR', 'RU'] as const)('%s: ссылка в PDF — публичный билет с языком', async lang => {
    const text = await pdfText(lang);
    const uris = [...text.matchAll(/\/URI \(([^)]+)\)/g)].map(m => m[1]);
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris) expect(uri).toBe(`${SITE}/#/ticket?code=${CODE}&lang=${lang}`);
    expect(text).not.toContain('account=tickets');
  });

  it('QR в PDF по-прежнему содержит ссылку проверки на входе', () => {
    const svc = projectSource('src/services/ticketPdfService.ts');
    expect(svc).toContain("doc.addImage(qrDataUrl, 'PNG', MARGIN, blockY, qrSize, qrSize)");
    expect(ticketQrPayload(CODE)).toBe(`${SITE}/#/admin/checkin?ticket=${CODE}`);
  });
});

// ── Публичный вид брони ───────────────────────────────────────────────────

describe('статус билета по коду — одно правило', () => {
  const base = {
    showId: 'shutka', showTitle: 'Шутка', showDate: '02 Окт 2026', showTime: '20:00',
    ticketType: 'standard', ticketsCount: 2, totalAmount: 60,
    userName: 'Анна', userEmail: 'anna@example.com', userPhone: '+33749661940', userId: 'uid-1',
    paymentReference: 'TAT-X', stripePaymentIntentId: 'pi_123', comment: 'секрет',
  };

  it.each([
    [{ status: 'confirmed', paymentStatus: 'paid' },                           'active'],
    [{ status: 'pending',   paymentStatus: 'not_paid' },                       'active'],
    [{ status: 'pending',   paymentStatus: 'awaiting_transfer' },              'active'],
    [{ status: 'pending',   paymentStatus: 'awaiting_online' },                'payment_pending'],
    [{ status: 'attended',  paymentStatus: 'paid' },                           'attended'],
    [{ status: 'cancelled', paymentStatus: 'not_paid' },                       'cancelled'],
    [{ status: 'cancelled', paymentStatus: 'expired' },                        'cancelled'],
    [{ status: 'cancelled', paymentStatus: 'refunded' },                       'refunded'],
    [{ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'pending' } }, 'refunded'],
    [{ status: 'cancelled', paymentStatus: 'paid', refund: { status: 'failed' } },  'cancelled'],
    [{ status: 'weird',     paymentStatus: 'weird' },                          'cancelled'],
  ])('%o → %s', (patch, state) => {
    expect(publicTicketState({ ...base, ...patch })).toBe(state);
  });

  it('наружу — только белый список, без персональных данных', () => {
    const view = toPublicTicket(CODE, { ...base, status: 'confirmed', paymentStatus: 'not_paid' });
    expect(Object.keys(view).sort()).toEqual(
      ['amountDue', 'code', 'date', 'lines', 'payment', 'seats', 'showId', 'state', 'time', 'title'].sort());
    const json = JSON.stringify(view);
    for (const secret of ['Анна', 'anna@example.com', '+33749661940', 'uid-1', 'TAT-X', 'pi_123', 'секрет']) {
      expect(json).not.toContain(secret);
    }
    expect(view).toMatchObject({ payment: 'on_site', amountDue: 60, seats: 2, date: { FR: '02 Octobre 2026' } });
  });

  it('старая бронь без ticketItems и seatsCount читается', () => {
    const view = toPublicTicket(CODE, { ...base, status: 'confirmed', paymentStatus: 'paid' });
    expect(view.lines).toEqual([{ type: 'standard', quantity: 2 }]);
    expect(view.seats).toBe(2);
    expect(view.amountDue).toBeUndefined();
  });

  it('у недействующего билета нет суммы к оплате и способа оплаты', () => {
    for (const patch of [
      { status: 'cancelled', paymentStatus: 'refunded' },
      { status: 'pending', paymentStatus: 'awaiting_online' },
    ]) {
      const view = toPublicTicket(CODE, { ...base, ...patch });
      expect(view.payment).toBeUndefined();
      expect(view.amountDue).toBeUndefined();
    }
  });
});

// ── Сервер: только чтение, лимит, нормализация кода ───────────────────────

const found: { docs: { data: () => Record<string, unknown> }[] } = { docs: [] };
const queries: unknown[][] = [];
let rateAllowed = true;
vi.mock('../../server/booking/booking.repository.js', () => ({
  db: () => ({}),
  bookingsRef: () => ({
    where: (...args: unknown[]) => {
      queries.push(args);
      return { limit: () => ({ get: async () => ({ empty: found.docs.length === 0, docs: found.docs }) }) };
    },
  }),
}));
vi.mock('../../server/shared/rateLimit.js', () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: rateAllowed, remaining: 0, resetAtMs: 0 })),
}));

describe('GET /api/public-ticket', () => {
  beforeEach(() => { found.docs = []; queries.length = 0; rateAllowed = true; });

  it('находит бронь по нормализованному коду и отдаёт публичный вид', async () => {
    const { readPublicTicket } = await import('../../server/booking/publicTicket.service.js');
    found.docs = [{ data: () => ({ status: 'cancelled', paymentStatus: 'refunded', showId: 'shutka', ticketCode: CODE }) }];
    const ticket = await readPublicTicket('pkx3 e222', '1.2.3.4');
    expect(queries).toEqual([['ticketCode', '==', CODE]]);
    expect(ticket).toMatchObject({ code: CODE, state: 'refunded' });
  });

  it('неизвестный код — 404 not_found, кривой — 400 invalid_code без обращения к базе', async () => {
    const { readPublicTicket } = await import('../../server/booking/publicTicket.service.js');
    await expect(readPublicTicket(CODE, 'ip')).rejects.toMatchObject({ status: 404, reason: 'not_found' });
    await expect(readPublicTicket('../bookings', 'ip')).rejects.toMatchObject({ status: 400, reason: 'invalid_code' });
    await expect(readPublicTicket(undefined, 'ip')).rejects.toMatchObject({ status: 400 });
    expect(queries).toHaveLength(1);
  });

  it('перебор кодов упирается в лимит по адресу', async () => {
    const { readPublicTicket } = await import('../../server/booking/publicTicket.service.js');
    rateAllowed = false;
    await expect(readPublicTicket(CODE, 'ip')).rejects.toMatchObject({ status: 429 });
    expect(queries).toHaveLength(0);
  });

  it('сервис ничего не пишет в бронь и не требует входа', () => {
    const svc = projectSource('server/booking/publicTicket.service.ts');
    for (const w of ['.update(', '.set(', '.delete(', 'runTransaction', 'requireCaller', 'requireAdmin']) {
      expect(svc, w).not.toContain(w);
    }
    const handler = projectSource('api/public-ticket.ts');
    expect(handler).toContain("req.method !== 'GET'");
    expect(handler).toContain("'Cache-Control': 'no-store'");
    expect(handler).not.toMatch(/requireCaller|requireAdmin|Authorization/);
  });
});

// ── Страница ──────────────────────────────────────────────────────────────

describe('страница /#/ticket', () => {
  it('маршрут зарегистрирован и под границей ошибок', () => {
    const app = projectSource('src/app/App.tsx');
    expect(app).toContain('path="/ticket"');
    expect(app).toContain('<ErrorBoundary label="TicketPage"');
    expect(app.indexOf('path="/ticket"')).toBeLessThan(app.indexOf('path="*"'));
  });

  it('не требует входа: ни AuthContext, ни Firebase, ни токена', () => {
    const svc = projectSource('src/services/publicTicketService.ts');
    for (const src of [page, svc]) {
      for (const forbidden of ['useAuth', 'firebase/', 'getIdToken', 'Authorization', 'setAuthOpen', 'onRequireAuth']) {
        expect(src, forbidden).not.toContain(forbidden);
      }
    }
    expect(svc).toContain('/api/public-ticket?code=');
  });

  it('окно входа на /ticket не открывается: единственные триггеры — ?account= и ?checkout=', () => {
    const app = projectSource('src/app/App.tsx');
    // setAuthOpen(true) вызывается только из этих мест.
    expect(app.match(/setAuthOpen\(true\)/g)).toHaveLength(2);
    expect(app).toContain('const requireAuth   = useCallback(() => setAuthOpen(true), []);');
    expect(app).toContain('onAuthOpen={() => setAuthOpen(true)}'); // кнопка «Войти» на главной
    const gate = projectSource('src/app/AccountDeepLink.tsx');
    expect(gate).toContain("getAccountSectionFromLocation() === 'tickets'");
  });

  it('QR — только действующему билету или когда статус неизвестен', () => {
    expect(page).toContain("const showQr = lookup?.kind === 'unavailable'");
    expect(page).toContain("|| (lookup?.kind === 'ok' && lookup.ticket.state === 'active');");
    expect(page).toContain('if (!code || !showQr) return;');
    // Недействующий билет рисуется отдельной веткой — без <img> QR.
    const from = page.indexOf("if (ticket && ticket.state !== 'active') {");
    const branch = page.slice(from, page.indexOf('\n  }\n', from));
    expect(branch).toContain('<main');
    expect(branch).not.toContain('<img');
  });

  it('неверный или неизвестный код — сообщение, а не окно входа', () => {
    expect(page).toContain("if (!code || lookup?.kind === 'invalid')");
    expect(page).toContain("if (lookup?.kind === 'not_found')");
    expect(page).toContain("normalizeTicketCodeInput(params.get('code')");
  });

  it('не показывает персональные данные и не даёт менять бронь', () => {
    for (const field of ['userEmail', 'userPhone', 'userName', 'cancelBooking', 'resume_checkout', '<button']) {
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
    expect(page).toContain("const ACCOUNT_HREF = '/?account=tickets';");
    expect(page).not.toContain('#/?account=tickets"');
  });

  it('тексты страницы — в обоих словарях', async () => {
    const { RU } = await import('../../src/i18n/ru');
    const { FR } = await import('../../src/i18n/fr');
    expect(Object.keys(RU.publicTicket).sort()).toEqual(Object.keys(FR.publicTicket).sort());
    expect(FR.publicTicket.refundedTitle).toBe('Réservation annulée et remboursée');
    expect(RU.publicTicket.onSite(30)).toBe('на входе, 30 €');
  });
});

describe('QR, открытый зрителем', () => {
  it('страница проверки предлагает зрителю его публичный билет вместо входа сотрудника', () => {
    const gate = projectSource('src/pages/TicketCheckPage/CheckinAuthGate.tsx');
    expect(gate).toContain('to={`/ticket?code=${encodeURIComponent(publicCode)}`}');
    expect(gate.indexOf('spectatorBox')).toBeLessThan(gate.indexOf('<form'));
  });
});

describe('«Мои билеты» по-прежнему требуют входа', () => {
  it('AccountDeepLink без сессии просит войти', () => {
    const gate = projectSource('src/app/AccountDeepLink.tsx');
    expect(gate).toContain('onRequireAuth();');
    expect(gate).toMatch(/if \(user\) \{\s*onOpenTickets\(\);/);
  });

  it('правила Firestore: брони читает только владелец или admin', () => {
    const rules = projectSource('firestore.rules');
    expect(rules).toMatch(/match \/bookings\/\{\w+\}/);
    expect(rules).not.toMatch(/match \/bookings\/\{\w+\}\s*\{\s*allow read: if true/);
  });
});
