export function getShowIdFromLocation(location: Location = window.location): string | null {
  const searchShow = new URLSearchParams(location.search).get('show');
  if (searchShow) return searchShow;

  const hashQueryStart = location.hash.indexOf('?');
  if (hashQueryStart === -1) return null;

  return new URLSearchParams(location.hash.slice(hashQueryStart + 1)).get('show');
}

export function getShowPublicUrl(showId: string): string {
  const envUrl = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  const origin = envUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  const base = origin.replace(/\/$/, '');

  return `${base}/#/?show=${encodeURIComponent(showId)}`;
}
