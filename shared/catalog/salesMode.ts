// Режим продаж театра — ЕДИНСТВЕННЫЙ источник правды о том, какие спектакли
// сейчас можно забронировать и оплатить.
//
// Зачем: осенью 2026 театр временно сократил программу. Все спектакли остаются
// на сайте (Афиша — предстоящие, Репертуар, админка, сканер, «Мои билеты»), но новые брони
// и оплаты принимаются только на спектакли из списка ниже.
//
// Видимость и продажа — разные вещи: `published` в SEASON_CATALOG решает,
// есть ли спектакль на сайте вообще, а этот файл — можно ли его купить сейчас.
//
// КАК ВЕРНУТЬ ОБЫЧНУЮ РАБОТУ: поставить SALES_MODE = 'normal'. Больше ничего
// менять не нужно — сайт, форма брони и сервер снова продают все опубликованные
// спектакли, как до ограниченного режима.
//
// LIMITED_SALES_ALLOWLIST действует ТОЛЬКО в режиме 'limited'. Принцип —
// «запрещено всё, что не разрешено явно»: новый спектакль, добавленный в
// каталог во время паузы, в продажу сам не попадёт, пока его id не впишут сюда.
//
// Проверяют этот файл: сервер (создание брони, «Продолжить оплату»), форма
// брони, Афиша, Репертуар, кабинет и админка. Контракт —
// tests/unit/salesMode.test.ts.

import { SHOWS } from './shows.js';

export type SalesMode = 'normal' | 'limited';

export const SALES_MODE: SalesMode = 'limited';

/** Спектакли, которые продаются в режиме 'limited' (id из SEASON_CATALOG). */
export const LIMITED_SALES_ALLOWLIST: readonly string[] = [
  'enot',      // «Крошка Енот»
  'shapochka', // «Красная Шапочка»
];

/**
 * Можно ли бронировать спектакль в данном режиме. Неопубликованная заготовка
 * и неизвестный id не продаются ни в каком режиме: allowlist ослабить проверку
 * публикации не может. Прошедший спектакль проверяется отдельно
 * (showStartUtcMs) — это не забота режима продаж.
 */
export function isShowBookingEnabled(
  showId: string,
  mode: SalesMode = SALES_MODE,
  allowlist: readonly string[] = LIMITED_SALES_ALLOWLIST,
): boolean {
  if (!Object.hasOwn(SHOWS, showId)) return false;
  return mode === 'normal' || allowlist.includes(showId);
}

/**
 * Продажи опубликованного спектакля приостановлены именно ограниченным
 * режимом. По этому признаку сайт и админка показывают «временно недоступно»,
 * а не «спектакля нет».
 */
export function isShowSalesPaused(
  showId: string,
  mode: SalesMode = SALES_MODE,
  allowlist: readonly string[] = LIMITED_SALES_ALLOWLIST,
): boolean {
  return Object.hasOwn(SHOWS, showId) && !isShowBookingEnabled(showId, mode, allowlist);
}

/**
 * Театр работает в ограниченном режиме. Общего баннера об этом нет — статус
 * показывается локально у спектакля; признак нужен, например, бегущей строке.
 */
export function isLimitedSalesMode(mode: SalesMode = SALES_MODE): boolean {
  return mode === 'limited';
}

/** Машиночитаемая причина отказа сервера для спектакля, продажи которого закрыты. */
export const BOOKING_TEMPORARILY_UNAVAILABLE = 'booking_temporarily_unavailable' as const;
