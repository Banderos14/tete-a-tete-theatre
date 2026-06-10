/**
 * Extracts a ticket code from any QR scan result format.
 *
 * Supported formats:
 *   A) HashRouter URL: https://…/#/admin/checkin?ticket=RU3R-HZJF
 *   B) Regular URL:    https://…/admin/checkin?ticket=RU3R-HZJF
 *   C) JSON legacy:    {"ticketCode":"RU3R-HZJF"}
 *   D) Raw code:       RU3R-HZJF
 *
 * Returns null if the input looks like a URL but contains no ticket param.
 */
export function parseTicketCodeFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // URL форматы: hash (#/admin/checkin?ticket=CODE) и обычный (/admin/checkin?ticket=CODE)
  try {
    const url = new URL(text);

    // HashRouter URL: ticket lives inside the fragment, e.g. "#/admin/checkin?ticket=CODE"
    if (url.hash) {
      const qIndex = url.hash.indexOf('?');
      if (qIndex !== -1) {
        const code = new URLSearchParams(url.hash.slice(qIndex)).get('ticket');
        if (code) return decodeURIComponent(code);
      }
    }

    // Regular URL: ?ticket=CODE in the main search string
    const code = url.searchParams.get('ticket');
    if (code) return decodeURIComponent(code);

    // URL recognised but no ticket param — not our QR
    return null;
  } catch {
    // Not a URL — continue
  }

  // Старый JSON-формат: {"ticketCode":"RU3R-HZJF"}
  try {
    const obj = JSON.parse(text) as { ticketCode?: string };
    if (typeof obj.ticketCode === 'string' && obj.ticketCode) return obj.ticketCode;
  } catch {
    // Not JSON — continue
  }

  return text;
}
