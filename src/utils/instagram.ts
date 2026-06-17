const INSTAGRAM_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

// Принимает "username", "@username" или ссылку instagram.com/username — возвращает чистый username.
export function extractInstagramUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const urlMatch = trimmed.match(/instagram\.com\/([^/?#]+)/i);
  const value = urlMatch ? urlMatch[1] : trimmed.replace(/^@/, '');

  return value.replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}

export function isValidInstagramUsername(username: string): boolean {
  return INSTAGRAM_USERNAME_RE.test(username);
}

export function instagramProfileUrl(username: string): string {
  return `https://instagram.com/${username}`;
}
