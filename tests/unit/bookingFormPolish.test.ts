// Форма брони: повторное открытие, количество по тарифам, итог, чёткость текста.

import { describe, it, expect, vi } from 'vitest';
import { basketLinesFor, catalogTariffs, priceBasket } from '../../shared/domain/ticketBasket';
import { SHOWS } from '../../shared/catalog/shows';
import { ErrorBoundary } from '../../src/components/ui/ErrorBoundary/ErrorBoundary';
import { RU } from '../../src/i18n/ru';
import { FR } from '../../src/i18n/fr';
import { projectSource } from '../helpers/serverSource.js';

const SHUTKA   = catalogTariffs(SHOWS.shutka!.tickets);
const KORABLIK = catalogTariffs(SHOWS.korablik!.tickets);

describe('повторное открытие формы брони (регрессия)', () => {
  // Было: в одном спектакле меняли количество, открывали бронь другого —
  // первый рендер шёл со старой корзиной (эффект сброса срабатывает позже),
  // priceBasket бросал «Unknown ticket type», граница ошибок навсегда
  // показывала пустоту, и модалка не открывалась до перезагрузки.
  it('корзина другого спектакля не роняет расчёт: чужие тарифы отбрасываются', () => {
    const stale = [{ type: 'standard' as const, quantity: 2 }, { type: 'student' as const, quantity: 1 }];
    expect(() => priceBasket(KORABLIK, stale, false)).toThrow();
    const lines = basketLinesFor(KORABLIK, stale);
    expect(lines).toEqual([{ type: 'child', quantity: 1 }]);
    expect(() => priceBasket(KORABLIK, lines, false)).not.toThrow();
  });

  it('своя корзина сохраняется, пустая — один билет первого тарифа', () => {
    const own = [{ type: 'student' as const, quantity: 2 }, { type: 'standard' as const, quantity: 1 }];
    expect(basketLinesFor(SHUTKA, own)).toEqual(own);
    expect(basketLinesFor(SHUTKA, [])).toEqual([{ type: 'standard', quantity: 1 }]);
    expect(basketLinesFor(SHUTKA, [{ type: 'standard', quantity: 0 }])).toEqual([{ type: 'standard', quantity: 1 }]);
  });

  it('модалка: корзина привязана к спектаклю и считается только через basketLinesFor', () => {
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain('basketLinesFor(tariffs, basket.showId === (show?.id ?? null) ? basket.lines : [])');
    expect(modal).not.toMatch(/priceBasket\(tariffs, basket\b/);
    // Сброс при открытии для спектакля — корзина нового спектакля, способ оплаты по умолчанию.
    const reset = modal.slice(modal.indexOf('// Сбрасываем все поля при открытии для нового спектакля'));
    expect(reset.slice(0, reset.indexOf('}, [show?.id]);')))
      .toContain('setBasketState({ showId: show.id, lines: [] }); setPayment(defaultPaymentMethod(onlineEnabled));');
  });

  it('граница ошибок сбрасывается при следующем открытии (resetKey)', () => {
    const b = new ErrorBoundary({ children: null, resetKey: 1 });
    b.state = { hasError: true };
    const setState = vi.fn();
    b.setState = setState as never;
    b.props = { children: null, resetKey: 1 } as never;
    b.componentDidUpdate({ children: null, resetKey: 1 });
    expect(setState).not.toHaveBeenCalled();
    b.props = { children: null, resetKey: 2 } as never;
    b.componentDidUpdate({ children: null, resetKey: 1 });
    expect(setState).toHaveBeenCalledWith({ hasError: false });
  });

  it('каждое открытие брони меняет ключ сброса её границы ошибок', () => {
    const app = projectSource('src/app/App.tsx');
    expect(app).toContain('setBookingShow(show); setBookingSeq(n => n + 1);');
    expect(app).toContain('<ErrorBoundary label="BookingModal" resetKey={bookingSeq}>');
  });
});

describe('количество по тарифам: разметка и доступность', () => {
  const step = projectSource('src/components/ui/BookingModal/BookingFormStep.tsx');

  it('строка тарифа — не радио-выбор: нет точки и рамки выделения, есть группа −/n/+', () => {
    expect(step).not.toContain('ttRadio');
    expect(step).not.toContain('ticketTypeActive');
    expect(step).toContain('role="group" aria-label={label}');
  });

  it('кнопки − и + — настоящие кнопки с подписью, минимум и максимум через disabled', () => {
    expect(step).toContain('aria-label={t.booking.removeTicket(label)}');
    expect(step).toContain('aria-label={t.booking.addTicket(label)}');
    expect(step).toContain('disabled={busy || !canRemove(tt.id)}');
    expect(step).toContain('disabled={busy || soldOut || !canAdd(tt.id)}');
    expect(step).toContain('aria-live="polite"');
  });

  it('в модуле стилей нет второго .stepper — старый блок с рамками кнопок удалён (регрессия)', () => {
    // Старый неиспользуемый .stepper с «button { border: 0.5px }» совпал по имени
    // с новым и возвращал рамки вокруг − и +.
    const css = projectSource('src/components/ui/BookingModal/BookingModal.module.scss');
    expect(css.match(/^\.stepper \{/gm)).toHaveLength(1);
    expect(css).not.toMatch(/^\.ticketRow \{/m);
  });

  it('кнопки без кружков и рамок, но с кликабельной областью 36px и видимым фокусом', () => {
    const css = projectSource('src/components/ui/BookingModal/BookingModal.module.scss');
    const btn = css.slice(css.indexOf('.stepperBtn {'), css.indexOf('.stepperValue {'));
    expect(btn).toContain('border: none;');
    expect(btn).toContain('background: transparent;');
    expect(btn).toMatch(/width: 36px;\s*height: 36px;/);
    expect(btn).toContain('&:focus-visible');
    expect(btn).toContain('&:disabled { opacity: 0.25;');
  });
});

describe('итог: Количество / Итого', () => {
  it('две симметричные колонки с одинаковыми стилями подписи и значения', () => {
    const step = projectSource('src/components/ui/BookingModal/BookingFormStep.tsx');
    const summary = step.slice(step.indexOf('styles.basketSummary'), step.indexOf('{/* Loyalty summary */}'));
    expect(summary.match(/styles\.summaryLabel/g)).toHaveLength(2);
    expect(summary.match(/styles\.summaryValue/g)).toHaveLength(2);
    expect(summary).toContain('t.booking.quantity');
    expect(summary).toContain('t.booking.ticketsTotal(ticketsCount)');
    expect(summary).toContain('t.booking.total');
  });

  it('склонения RU: 1 билет, 2–4 билета, 5+ билетов, 11–14 билетов', () => {
    const f = RU.booking.ticketsTotal;
    expect([1, 2, 3, 4, 5, 10, 11, 12, 14, 21, 22, 25].map(f)).toEqual([
      '1 билет', '2 билета', '3 билета', '4 билета', '5 билетов', '10 билетов',
      '11 билетов', '12 билетов', '14 билетов', '21 билет', '22 билета', '25 билетов',
    ]);
    expect(RU.booking.quantity).toBe('Количество');
  });

  it('FR: 1 billet, 4 billets, Quantité', () => {
    expect(FR.booking.ticketsTotal(1)).toBe('1 billet');
    expect(FR.booking.ticketsTotal(4)).toBe('4 billets');
    expect(FR.booking.quantity).toBe('Quantité');
  });
});

describe('чёткость мелкого текста на Retina/4K', () => {
  // Проверяются правила, а не комментарии к ним.
  const css = (file: string) => projectSource(file).replace(/\/\/.*$/gm, '');
  const booking = css('src/components/ui/BookingModal/BookingModal.module.scss');
  const block = (css: string, selector: string) => {
    const i = css.indexOf(`${selector} {`);
    return css.slice(i, css.indexOf('\n}', i));
  };

  it('точка-радио карточки оплаты — без absolute и transform', () => {
    const dot = block(booking, '.paymentDot');
    expect(dot).not.toMatch(/(?<![-\w])transform:|position: absolute/);
  });

  it('бейдж «Рекомендуем»: целые размеры, рамка 1px, 9px, без transform', () => {
    const badge = block(booking, '.paymentBadge');
    expect(badge).toContain('height: 16px;');
    expect(badge).toContain('line-height: 14px;');
    expect(badge).toContain('border: 1px solid currentColor;');
    expect(badge).toContain('font-size: 9px;');
    expect(badge).not.toMatch(/0\.5px|(?<![-\w])transform:|letter-spacing: 1\.5px/);
    expect(badge).toContain('color: var(--form-red-text);');
  });

  it('размытие фона — не на предке модалки, а на отдельном слое', () => {
    const overlay = booking.slice(booking.indexOf('.overlay {'), booking.indexOf('.modal {'));
    expect(overlay.slice(0, overlay.indexOf('&::before'))).not.toContain('backdrop-filter');
    expect(overlay).toMatch(/&::before \{[\s\S]*backdrop-filter: blur\(10px\)/);
  });

  it('открытые кабинет и окно входа не держат transform (текст вне GPU-слоя)', () => {
    const drawer = css('src/components/ui/ProfileDrawer/ProfileDrawer.module.scss');
    const auth   = css('src/components/ui/AuthModal/AuthModal.module.scss');
    expect(drawer).not.toContain('transform: scale(1) translateY(0)');
    expect(auth).not.toContain('transform: translateY(0) scale(1)');
    expect(block(drawer, '.unsavedToast')).not.toMatch(/(?<![-\w])transform:/);
  });
});
