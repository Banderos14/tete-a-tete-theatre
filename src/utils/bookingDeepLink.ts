// Ссылка «сразу к брони с выбранным тарифом»: /#/?show=<id>&tariff=<тариф>.
//
// Зачем: театр рассылает по ссылке на каждый тариф одного спектакля (например,
// «Дюймовочка» — дети «Созвездия» / обычный билет). Ссылка открывает обычную
// форму брони с одним билетом этого тарифа; дальше зритель свободно меняет
// количество и состав — это та же корзина, что и без ссылки.
//
// Ссылка выбирает ТОЛЬКО тариф. Цены, суммы и количества из URL не читаются:
// форма берёт цену из каталога, а сервер (/api/create-booking) всё равно
// пересчитывает её сам. Неизвестный тариф, прошедший или закрытый для продаж
// спектакль — ссылка деградирует до обычной ?show= (карточка спектакля).

import type { Show, TicketTypeId } from '../types';
import type { BasketLine } from '../../shared/domain/ticketBasket';
import { isShowBookingEnabled } from '../../shared/catalog/salesMode';
import { isShowPast } from '../data/shows';
import { getQueryParam, getPublicSiteBase } from './showUrl';

/** Имя параметра тарифа. Не `ticket`: им уже занят код билета у сканера. */
export const TARIFF_PARAM = 'tariff';

export function getTariffFromLocation(location: Location = window.location): string | null {
  return getQueryParam(TARIFF_PARAM, location);
}

/**
 * Спектакль и тариф для немедленного открытия формы брони — или null, если
 * ссылку нужно обработать как обычную ?show=.
 */
export function resolveBookingDeepLink(
  show: Show | null | undefined,
  tariff: string | null,
  nowMs: number = Date.now(),
): { show: Show; ticketType: TicketTypeId } | null {
  if (!show || !tariff) return null;
  const ticketType = show.ticketTypes.find(tt => tt.id === tariff)?.id;
  if (!ticketType) return null;
  if (!isShowBookingEnabled(show.id) || isShowPast(show, nowMs)) return null;
  return { show, ticketType };
}

/** Публичная ссылка на бронь спектакля с выбранным тарифом. */
export function getShowTariffBookingUrl(showId: string, ticketType: TicketTypeId, base: string = getPublicSiteBase()): string {
  return `${base.replace(/\/$/, '')}/#/?show=${encodeURIComponent(showId)}&${TARIFF_PARAM}=${encodeURIComponent(ticketType)}`;
}

/** Стартовая корзина формы: один билет тарифа из ссылки, если он есть у спектакля; иначе — выбор по умолчанию. */
export function initialBasketLines(show: Pick<Show, 'ticketTypes'>, ticketType: TicketTypeId | undefined): BasketLine[] {
  return ticketType && show.ticketTypes.some(tt => tt.id === ticketType) ? [{ type: ticketType, quantity: 1 }] : [];
}
