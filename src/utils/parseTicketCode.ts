// Извлекает код билета из результата QR-сканирования.
// Форматы: HashRouter URL (…/#/admin/checkin?ticket=CODE), обычный URL, JSON-легаси, голый код.
// Возвращает null, если input похож на URL, но ticket-параметра нет.
export function parseTicketCodeFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // URL форматы: hash (#/admin/checkin?ticket=CODE) и обычный (/admin/checkin?ticket=CODE)
  try {
    const url = new URL(text);

    // HashRouter URL: ticket в fragment, напр. "#/admin/checkin?ticket=CODE"
    if (url.hash) {
      const qIndex = url.hash.indexOf('?');
      if (qIndex !== -1) {
        const code = new URLSearchParams(url.hash.slice(qIndex)).get('ticket');
        if (code) return decodeURIComponent(code);
      }
    }

    // Обычный URL: ?ticket=CODE в строке запроса
    const code = url.searchParams.get('ticket');
    if (code) return decodeURIComponent(code);

    // URL распознан, но ticket-параметра нет — чужой QR
    return null;
  } catch {
    // Не URL — продолжаем
  }

  // Старый JSON-формат: {"ticketCode":"RU3R-HZJF"}
  try {
    const obj = JSON.parse(text) as { ticketCode?: string };
    if (typeof obj.ticketCode === 'string' && obj.ticketCode) return obj.ticketCode;
  } catch {
    // Не JSON — продолжаем
  }

  return text;
}
