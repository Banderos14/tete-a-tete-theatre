import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeEmailHtml } from '../../src/services/email/index.js';
import { endpointSource } from '../helpers/serverSource.js';

const ROOT = resolve(__dirname, '../..');
// Почтовый слой — каталог: шаблоны, вёрстка и транспорт лежат отдельно.
const src  = endpointSource('src/services/email/index.ts');

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
  it('все HTML-подстановки имени экранированы', () => {
    const htmlUnescaped = [...src.matchAll(/\$\{data\.userName\}/g)];
    // Оставшиеся неэкранированные подстановки допустимы только в текстовых версиях.
    for (const m of htmlUnescaped) {
      const line = src.slice(0, m.index).split('\n').length;
      const text = src.split('\n')[line - 1]!;
      expect(text, `строка ${line} выглядит как HTML`).not.toMatch(/<[a-z]/i);
    }
  });

  it('в HTML-приветствиях используется экранирование', () => {
    expect(src).toContain('${escapeEmailHtml(data.userName)}');
    expect(src).toContain('escapeEmailHtml(data.userName)]');
  });

  it('текстовые версии писем НЕ экранируются — там были бы &amp;', () => {
    const textBlocks = src.split('\n').filter(l => l.includes('data.userName') && !l.includes('escapeEmailHtml'));
    expect(textBlocks.length).toBeGreaterThan(0);
    for (const l of textBlocks) expect(l).not.toMatch(/<[a-z]/i);
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
