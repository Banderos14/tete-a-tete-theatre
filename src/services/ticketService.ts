// Формат кода билета: XXXX-XXXX (8 символов без похожих: 0/O, 1/I/L).
// crypto.getRandomValues — криптографическая случайность, не Math.random.

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateTicketCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => CHARSET[b % CHARSET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
