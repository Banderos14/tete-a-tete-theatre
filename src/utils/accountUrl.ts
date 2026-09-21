// Прямая ссылка в личный кабинет — «Мои билеты».
//
// Письмо и success-модалка не должны высаживать зрителя на главную: билет с QR
// лежит и в кабинете, путь к нему — в один клик. Саму ссылку для письма строит
// сервер (myTicketsUrl в shared/domain/ticketCode.ts). Отдельной страницы для
// этого нет — открывается существующий ProfileDrawer, поэтому адрес остаётся
// адресом главной с параметром:
//
//   https://www.theatre-teteatete.fr/#/?account=tickets
//
// Формат тот же, что у ?show=..., и разбирается тем же getQueryParam, так что
// обе ссылки сосуществуют и не мешают друг другу.

import { getQueryParam } from './showUrl';

/** Разделы кабинета, которые можно открыть ссылкой. */
export const ACCOUNT_DEEP_LINKS = ['tickets'] as const;
export type AccountDeepLink = (typeof ACCOUNT_DEEP_LINKS)[number];

const PARAM = 'account';

export function getAccountSectionFromLocation(
  location: Location = window.location,
): AccountDeepLink | null {
  const value = getQueryParam(PARAM, location);
  return (ACCOUNT_DEEP_LINKS as readonly string[]).includes(value ?? '')
    ? (value as AccountDeepLink)
    : null;
}

/**
 * Убрать параметр из адреса после того, как кабинет открыт.
 *
 * Иначе перезагрузка страницы снова открывала бы кабинет, а зритель этого
 * уже не просил. Делается через replaceState: история навигации не засоряется,
 * а HashRouter продолжает работать с тем же путём.
 */
export function clearAccountParam(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;

  const { pathname, search, hash } = window.location;

  const strip = (query: string): string => {
    const params = new URLSearchParams(query);
    if (!params.has(PARAM)) return query;
    params.delete(PARAM);
    const rest = params.toString();
    return rest ? `?${rest}` : '';
  };

  const nextSearch = strip(search.startsWith('?') ? search.slice(1) : search);

  const hashQueryStart = hash.indexOf('?');
  const nextHash = hashQueryStart === -1
    ? hash
    : hash.slice(0, hashQueryStart) + strip(hash.slice(hashQueryStart + 1));

  window.history.replaceState(null, '', `${pathname}${nextSearch}${nextHash}`);
}
