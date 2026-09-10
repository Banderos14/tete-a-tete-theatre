// Проверка, что скачанный файл — действительно шрифт.
//
// Зачем: у сайта SPA-rewrite (`/(.*)` → `/index.html`), поэтому запрос
// несуществующего `/fonts/что-угодно.ttf` возвращает HTML со статусом 200 OK.
// Проверки `res.ok` для ассета недостаточно — она проходит, и в jsPDF уезжает
// HTML вместо шрифта. jsPDF при этом НЕ бросает исключение: он глушит ошибки
// собственным PubSub, и текст просто молча пропадает из PDF.

// Сигнатуры sfnt-контейнеров.
const SFNT_SIGNATURES: readonly number[][] = [
  [0x00, 0x01, 0x00, 0x00],       // TrueType
  [0x74, 0x72, 0x75, 0x65],       // 'true' (TrueType, Apple)
  [0x74, 0x74, 0x63, 0x66],       // 'ttcf' (TrueType Collection)
  [0x4f, 0x54, 0x54, 0x4f],       // 'OTTO' (CFF/OpenType)
];

export function isSfntFontBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return SFNT_SIGNATURES.some(sig => sig.every((b, i) => bytes[i] === b));
}

// Content-Type, который допустим для файла шрифта.
// Некоторые хостинги отдают шрифты как application/octet-stream — это нормально;
// а вот text/html означает, что мы получили страницу, а не ассет.
export function isPlausibleFontContentType(contentType: string | null): boolean {
  if (!contentType) return true; // заголовок не обязателен — решает сигнатура
  const type = contentType.toLowerCase();
  if (type.includes('text/html')) return false;
  if (type.includes('application/json')) return false;
  return true;
}
