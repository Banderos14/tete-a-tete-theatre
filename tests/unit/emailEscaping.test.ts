import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeEmailHtml } from '../../src/services/email/index.js';
import { buildTicketEmail } from '../../shared/email/ticketEmail.js';

const ROOT = resolve(__dirname, '../..');

describe('escapeEmailHtml', () => {
  it('экранирует разметку', () => {
    expect(escapeEmailHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('экранирует попытку вставить ссылку', () => {
    expect(escapeEmailHtml('<a href="http://evil">клик</a>'))
      .toBe('&lt;a href=&quot;http://evil&quot;&gt;клик&lt;/a&gt;');
  });

  it('амперсанд экранируется первым — без двойного экранирования', () => {
    expect(escapeEmailHtml('A & B')).toBe('A &amp; B');
    expect(escapeEmailHtml('&lt;')).toBe('&amp;lt;');
  });

  it('кавычки не ломают атрибуты', () => {
    expect(escapeEmailHtml(`" onmouseover='x'`)).toBe('&quot; onmouseover=&#39;x&#39;');
  });

  it('обычные имена, включая кириллицу и акценты, не портятся', () => {
    expect(escapeEmailHtml('Наталья')).toBe('Наталья');
    expect(escapeEmailHtml('Éloïse Müller')).toBe('Éloïse Müller');
  });

  it('пустое и null-подобное не падает', () => {
    expect(escapeEmailHtml('')).toBe('');
    expect(escapeEmailHtml(undefined as unknown as string)).toBe('');
  });
});

describe('шаблоны писем', () => {
  const ticketSrc = readFileSync(resolve(ROOT, 'shared/email/ticketEmail.ts'), 'utf8');

  it('имя зрителя в HTML письма-билета экранируется', () => {
    const mail = buildTicketEmail({
      userName: '<b>Иван</b><a href="http://evil">x</a>', showId: 'shutka', showTitle: 'T', showDate: '02 Окт 2026',
      showTime: '20:00', ticketsCount: 1, ticketType: 'standard', totalAmount: 20, ticketCode: 'ABCD-2345',
      status: 'pending', paymentMethod: 'on_site', paymentStatus: 'not_paid', lang: 'RU',
    }, { kind: 'booking', withQr: true });
    expect(mail.html).toContain('&lt;b&gt;Иван&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Иван</b>');
    expect(mail.html).not.toContain('href="http://evil"');
  });

  it('в шаблонах имя подставляется только через escapeEmailHtml', () => {
    expect(ticketSrc).toContain('escapeEmailHtml(b.userName');
    expect(ticketSrc).not.toMatch(/\$\{b\.userName\}/);
  });
});


describe('PII не попадает в консоль браузера', () => {
  const modal = readFileSync(resolve(ROOT, 'src/components/ui/BookingModal/BookingModal.tsx'), 'utf8');
  const logStart = modal.indexOf("console.error('[BookingModal] createBooking failed'");
  const logBlock = modal.slice(logStart, modal.indexOf('});', logStart));

  it('в лог не пишутся uid, e-mail и телефон', () => {
    expect(logBlock).not.toMatch(/uid:\s*user\?\.uid/);
    expect(logBlock).not.toMatch(/email:\s*user\?\.email/);
    expect(logBlock).not.toMatch(/phoneRaw:/);
    expect(logBlock).not.toMatch(/userDocPhone:/);
  });

  it('технические поля для разбора остались', () => {
    expect(logBlock).toContain('errorCode');
    expect(logBlock).toContain('showId');
    expect(logBlock).toContain('phoneValid');
  });
});
