// Код билета и адрес, который зашит в его QR.
//
// Изоморфный модуль: одну и ту же ссылку строят кабинет и PDF (браузер) и
// письмо (сервер), а сканер разбирает её обратно. Раньше формат адреса жил
// только в src/services/qrService.ts, и серверу пришлось бы завести вторую
// копию — ровно так появляются «QR в кабинете одного вида, в письме другого».

/**
 * Боевой адрес сайта. QR — это билет, который зритель унесёт с собой, поэтому
 * он всегда ведёт на боевой домен, откуда бы ни был открыт кабинет (localhost,
 * preview). Переопределяется только явно: VITE_PUBLIC_SITE_URL во фронтенде и
 * PUBLIC_SITE_URL на сервере — в production обе равны этому значению.
 */
export const CANONICAL_SITE_URL = 'https://www.theatre-teteatete.fr';

/** Путь проверки в формате HashRouter — без /#/ Vercel отдал бы 404. */
export function ticketCheckPath(ticketCode: string): string {
  return `/#/admin/checkin?ticket=${encodeURIComponent(ticketCode)}`;
}

/** Полный адрес для QR: базовый адрес сайта без завершающего слэша + путь проверки. */
export function ticketCheckUrl(siteBase: string, ticketCode: string): string {
  return `${siteBase.replace(/\/+$/, '')}${ticketCheckPath(ticketCode)}`;
}

/**
 * ЕДИНСТВЕННАЯ точка, где билет превращается в содержимое QR.
 *
 * Идентичность билета — код брони: он выдаётся сервером один раз при создании
 * и больше не меняется. Кабинет, PDF и письмо зовут эту функцию, поэтому одна
 * бронь везде даёт один и тот же QR, сколько бы раз его ни рисовали.
 */
export function ticketQrPayload(ticketCode: string, siteBase: string = CANONICAL_SITE_URL): string {
  return ticketCheckUrl(siteBase || CANONICAL_SITE_URL, ticketCode);
}

/**
 * Публичная страница билета: QR, код и инструкция — без входа на сайт.
 *
 * Кнопка «Открыть билет» в письме ведёт сюда. Письмо часто открывается в
 * другом браузере, чем тот, где зритель входил (Gmail → Chrome, покупка была в
 * Safari), и кабинет попросил бы войти заново. Страница ничего не читает из
 * базы и не показывает персональных данных: всё, что на ней есть, уже
 * содержится в самой ссылке — код брони, тот же, что зашит в QR письма.
 */
export function publicTicketUrl(ticketCode: string, siteBase: string = CANONICAL_SITE_URL, lang?: 'RU' | 'FR'): string {
  const base = (siteBase || CANONICAL_SITE_URL).replace(/\/+$/, '');
  const langPart = lang ? `&lang=${lang}` : '';
  return `${base}/#/ticket?code=${encodeURIComponent(ticketCode)}${langPart}`;
}

/** Раздел «Мои билеты» личного кабинета — дополнительный путь к тому же билету. */
export function myTicketsUrl(siteBase: string = CANONICAL_SITE_URL): string {
  return `${(siteBase || CANONICAL_SITE_URL).replace(/\/+$/, '')}/#/?account=tickets`;
}

/**
 * Код, введённый сотрудником руками или продиктованный зрителем.
 *
 * Прощает то, что реально случается у входа: строчные буквы, пробелы, дефис
 * другого вида или его отсутствие («ab12cd34»). Не угадывает символы: 0/O и
 * 1/I/L в алфавит кода не входят, и молча «исправлять» их значило бы искать
 * чужой билет. Возвращает нормализованный код либо null, если формат не тот.
 */
export function normalizeTicketCodeInput(raw: string): string | null {
  const compact = String(raw ?? '')
    .toUpperCase()
    .replace(/[\s‐-―−_.-]+/g, '');
  if (!/^[A-Z0-9]{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
