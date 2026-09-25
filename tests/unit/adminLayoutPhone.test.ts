// Админка и репертуар: телефон для показа, строка письма-билета, раскладка
// таблицы броней, id Stripe, сетка репертуара без пустого серого блока.

import { describe, it, expect } from 'vitest';
import { formatPhoneForDisplay } from '../../src/utils/phoneDisplay';
import { ticketEmailLine } from '../../src/pages/AdminPage/adminFormatting';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { projectSource } from '../helpers/serverSource.js';

describe('телефон для показа (международный формат)', () => {
  it('Франция: мобильный и городской', () => {
    expect(formatPhoneForDisplay('+33749661940')).toBe('+33 7 49 66 19 40');
    expect(formatPhoneForDisplay('+33142685300')).toBe('+33 1 42 68 53 00');
  });

  it('Украина, Россия и другие страны — по их правилам, код страны из 1–3 цифр', () => {
    expect(formatPhoneForDisplay('+380671234567')).toBe('+380 67 123 4567');
    expect(formatPhoneForDisplay('+79161234567')).toBe('+7 916 123 45 67');
    expect(formatPhoneForDisplay('+4915112345678')).toBe('+49 1511 2345678');
    expect(formatPhoneForDisplay('+14155552671')).toBe('+1 415 555 2671');
    expect(formatPhoneForDisplay('+32470123456')).toBe('+32 470 12 34 56');
  });

  it('уже отформатированный номер показывается так же', () => {
    expect(formatPhoneForDisplay('+33 7 49 66 19 40')).toBe('+33 7 49 66 19 40');
    expect(formatPhoneForDisplay('+380 (67) 123-45-67')).toBe('+380 67 123 4567');
  });

  it('нераспознаваемое — как есть: без «+», обрывок, лишние цифры, мусор', () => {
    for (const raw of ['0749661940', '+3374966', '+33749661940999', 'abc', '+999123456789']) {
      expect(formatPhoneForDisplay(raw)).toBe(raw);
    }
    expect(formatPhoneForDisplay('')).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
  });

  it('только показ: в базу и в ссылку tel: уходит исходный номер', () => {
    const tab = projectSource('src/pages/AdminPage/BookingsTab.tsx');
    expect(tab).toContain('formatPhoneForDisplay(b.userPhone)');
    expect(tab).toContain("href={`tel:${b.userPhone.replace(/[^\\d+]/g, '')}`}");
    expect(projectSource('src/pages/AdminPage/UsersTab.tsx')).toContain('formatPhoneForDisplay(u.phone)');
    expect(projectSource('src/pages/TicketCheckPage/BookingSearchPanel.tsx')).toContain('formatPhoneForDisplay(b.userPhone)');
  });

  it('библиотека — облегчённые метаданные и только в ленивых чанках (не в основном бандле)', () => {
    expect(projectSource('src/utils/phoneDisplay.ts')).toContain("from 'libphonenumber-js/min'");
    for (const eager of ['src/main.tsx', 'src/app/App.tsx', 'src/pages/HomePage/HomePage.tsx']) {
      expect(projectSource(eager)).not.toContain('phoneDisplay');
    }
  });
});

describe('строка письма-билета под кнопкой «Отправить билет»', () => {
  const at = Date.parse('2026-09-24T20:18:00Z');

  it('последнее письмо с датой и временем', () => {
    const line = ticketEmailLine({ booking: { status: 'sent', atMs: at - 86400000 }, paid: { status: 'sent', atMs: at } });
    expect(line).toMatch(/^Билет отправлен: \d{2}\.\d{2}\.2026, \d{2}:\d{2}$/);
  });

  it('не ушло / письмо об отмене не считается / писем нет', () => {
    expect(ticketEmailLine({ paid: { status: 'failed', atMs: at } })).toMatch(/^Билет НЕ ушёл: /);
    expect(ticketEmailLine({ cancelled: { status: 'sent', atMs: at } })).toBeNull();
    expect(ticketEmailLine(undefined)).toBeNull();
  });
});

describe('таблица броней: раскладка', () => {
  const tab = projectSource('src/pages/AdminPage/BookingsTab.tsx');
  const css = projectSource('src/pages/AdminPage/AdminPage.module.scss').replace(/\/\/.*$/gm, '');
  const block = (selector: string) => { const i = css.indexOf(`\n${selector} {`) + 1; return css.slice(i, css.indexOf('\n}', i)); };

  it('ширины колонок задаёт colgroup, раскладка фиксированная, всё по центру', () => {
    expect(tab.match(/<col className=\{styles\.col\w+\} \/>/g)).toHaveLength(11);
    const table = block('.bookingsTable');
    expect(table).toContain('table-layout: fixed;');
    expect(table).toMatch(/text-align: center;\s*vertical-align: middle;/);
  });

  it('сумма ширин колонок помещается на MacBook (≤ 1356px = 1440 − поля − рамка)', () => {
    const widths = [...css.matchAll(/^\.col\w+\s*\{ width: (\d+)px; \}/gm)].map(m => Number(m[1]));
    expect(widths).toHaveLength(11);
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(1356);
    expect(block('.bookingsTable')).toContain(`min-width: ${sum}px;`);
  });

  it('воздух справа от «Оплата» и «Дата брони»; дата брони — двумя строками', () => {
    expect(block('.bookingsTable')).toMatch(/th:nth-child\(5\), td:nth-child\(5\),\s*th:nth-child\(8\), td:nth-child\(8\) \{ padding-right: 22px; \}/);
    expect(tab).toContain("const [date, time] = formatTimestamp(b.createdAt).split(', ');");
  });

  it('оплаченная онлайн: короткая пометка из словаря, подробности — в title', () => {
    expect(tab).toContain('title={t.admin.refundInStripeTitle}>{t.admin.refundInStripe}');
    expect(RU.admin.refundInStripe).toBe('Отмена брони — через возврат в Stripe → Transactions.');
    expect(RU.admin.refundInStripe.length).toBeLessThan(60);
    expect(FR.admin.refundInStripe).toContain('Stripe → Transactions');
    expect(tab).not.toContain('Payments → платёж → Refund');
  });

  it('Stripe: платёж — главный, сессия сохранена, но вторична; id не раздувают колонку', () => {
    const details = tab.slice(tab.indexOf('function StripeDetails'), tab.indexOf('function BookingRow'));
    expect(details).toContain('styles.stripePrimary}>Платёж: <StripeId id={b.stripePaymentIntentId} />');
    expect(details).toContain('styles.stripeSecondary}>Сессия: <StripeId id={b.stripeCheckoutSessionId} />');
    expect(details.indexOf('Платёж:')).toBeLessThan(details.indexOf('Сессия:'));
    expect(details).toContain('{b.refund && (');
    const id = block('.stripeId');
    expect(id).toContain('text-overflow: ellipsis;');
    expect(id).toContain('user-select: all;');
  });

  it('«Отправить билет» — той же высоты, что остальные кнопки; строка письма — под кнопкой', () => {
    for (const btn of ['.actionResend', '.actionCancel', '.actionPaid', '.actionUnpaid']) {
      expect(block(btn)).toContain('height: 24px;');
      expect(block(btn)).toContain('font-size: 10px;');
    }
    expect(tab).toContain('{m.emailLine && <p className={styles.actionMeta}>{m.emailLine}</p>}');
    // Кнопки и подписи под ними — один центрированный блок.
    expect(block('.actionsBlock')).toMatch(/flex-direction: column;\s*align-items: center;/);
  });

  it('статусы — одна система: одна строка = 20px (14 + 2×2 + 2×1), рамка 1px, перенос внутри ячейки', () => {
    for (const badge of ['.badge', '.payBadge', '.statusBadge']) {
      const b = block(badge);
      expect(b).toContain('min-height: 20px;');
      expect(b).toContain('padding: 2px 7px;');
      expect(b).toContain('line-height: 14px;');
      expect(b).toContain('border: 1px solid transparent;');
      expect(b).toContain('white-space: normal;');
    }
  });
});

describe('репертуар: сетка без серого блока', () => {
  const css = projectSource('src/pages/HomePage/sections/Repertoire/Repertoire.module.scss').replace(/\/\/.*$/gm, '');
  const grid = css.slice(css.indexOf('.grid {'), css.indexOf('\n}', css.indexOf('.grid {')));

  it('сетка не рисует фон и рамку на всю ширину — рамку рисует карточка', () => {
    expect(grid).not.toMatch(/background:|::before|overflow: hidden/);
    expect(grid).toContain('align-content: start;');
    const item = css.slice(css.indexOf('.item {'), css.indexOf('\n}', css.indexOf('.item {')));
    expect(item).toContain('box-shadow: 0 0 0 1px var(--line);');
  });
});

describe('брони на планшете и телефоне — карточки', () => {
  const tab = projectSource('src/pages/AdminPage/BookingsTab.tsx');
  const css = projectSource('src/pages/AdminPage/AdminPage.module.scss').replace(/\/\/.*$/gm, '');
  const block = (selector: string) => { const i = css.indexOf(`\n${selector} {`) + 1; return css.slice(i, css.indexOf('\n}', i)); };

  it('до 1100px таблица скрыта, показан список карточек; на телефоне — одна колонка', () => {
    expect(tab).toContain('className={`${styles.tableWrap} ${styles.desktopOnly}`}');
    expect(tab).toContain('<div className={styles.mobileList}>');
    expect(block('.desktopOnly')).toMatch(/@include mixins\.tablet \{ display: none; \}/);
    const list = block('.mobileList');
    expect(list).toMatch(/display: none;[\s\S]*@include mixins\.tablet \{\s*display: grid;/);
    expect(list).toMatch(/@include mixins\.small \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });

  it('карточка собрана из тех же блоков, что строка таблицы, — логика не дублируется', () => {
    const row  = tab.slice(tab.indexOf('function BookingRow('), tab.indexOf('function BookingMobileCard('));
    const card = tab.slice(tab.indexOf('function BookingMobileCard('));
    for (const part of ['<NameBlock', '<PhoneLink', '<EmailLink', '<TicketsBlock', '<AmountBlock', '<MethodBadge',
      '<PayStateBlock', '<CreatedAt', '<StatusBlock', '<CommentBlock', '<ActionsBlock']) {
      expect(row).toContain(part);
      expect(card).toContain(part);
    }
    expect(row).toContain('const m = rowModel(b);');
    expect(card).toContain('const m = rowModel(b);');
    // Кнопки, Stripe и правила отмены — только в общих блоках.
    expect(card).not.toMatch(/onResendTicket\(|onConfirmAction\(|refundInStripe =/);
  });

  it('в карточке все поля брони подписаны', () => {
    const card = tab.slice(tab.indexOf('function BookingMobileCard('));
    for (const label of ['t.admin.tickets', 't.admin.amount', 't.admin.payment', 'Код брони', 't.admin.paymentStatus', 't.admin.date', 't.admin.comment']) {
      expect(card).toContain(label);
    }
  });
});
