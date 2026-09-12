// Разбор публичных ссылок сайта.
//
// Роутер — HashRouter, поэтому параметр может лежать и в обычном query
// (?show=...), и после решётки (/#/?show=...). Обе формы разбираются одним
// местом: любой новый deep-link обязан работать в обеих.
export function getQueryParam(name: string, location: Location = window.location): string | null {
  const fromSearch = new URLSearchParams(location.search).get(name);
  if (fromSearch) return fromSearch;

  const hashQueryStart = location.hash.indexOf('?');
  if (hashQueryStart === -1) return null;

  return new URLSearchParams(location.hash.slice(hashQueryStart + 1)).get(name);
}

export function getShowIdFromLocation(location: Location = window.location): string | null {
  return getQueryParam('show', location);
}

// Базовый адрес сайта. VITE_PUBLIC_SITE_URL задаётся и в Preview, и в проде —
// поэтому ссылки в письмах ведут туда, откуда письмо отправлено.
export function getPublicSiteBase(): string {
  const envUrl = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  const origin = envUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin.replace(/\/$/, '');
}

export function getShowPublicUrl(showId: string): string {
  return `${getPublicSiteBase()}/#/?show=${encodeURIComponent(showId)}`;
}
