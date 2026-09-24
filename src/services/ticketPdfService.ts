import type { Booking } from '../types/booking';
import { isSfntFontBinary, isPlausibleFontContentType } from '../utils/fontBinary';
import { localizedShowTitle } from '../../shared/catalog/showTitle';
import { bookingTicketLines } from '../../shared/domain/ticketBasket';
import { ticketTypeLabel } from '../../shared/catalog/ticketTypes';

// Транслитерация кириллицы → латиница — запасной вариант, если кирилличные шрифты не загрузились.
const CYR: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
  'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh',
  'З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O',
  'П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts',
  'Ч':'Ch','Ш':'Sh','Щ':'Shch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
};

function transliterate(text: string): string {
  return text
    .split('')
    .map(ch => (CYR[ch] !== undefined ? CYR[ch] : ch.charCodeAt(0) > 0xFF ? '' : ch))
    .join('');
}

// "17 Май 2026" → "17.05.2026": Helvetica не умеет в кириллицу, числовой формат безопаснее.
const MONTH_TO_NUM: Record<string, string> = {
  'Янв':'01','Фев':'02','Мар':'03','Апр':'04',
  'Май':'05','Июн':'06','Июл':'07','Авг':'08',
  'Сен':'09','Окт':'10','Ноя':'11','Дек':'12',
};

function formatDateForPdf(showDate: string): string {
  const parts = showDate.trim().split(/\s+/);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const num = MONTH_TO_NUM[month];
    if (num) return `${day.padStart(2, '0')}.${num}.${year}`;
  }
  // Неизвестный формат — транслит, чтобы Helvetica не получил сырую кириллицу.
  return transliterate(showDate).trim() || showDate;
}

// FR: Latin-1 с акцентами (é, à, è) — Helvetica WinAnsi поддерживает нативно.
// RU: кириллица через Liberation Sans; если шрифт не загрузился — подписи
// транслитом (RU_LATIN), а инструкция у QR — по-английски.
const LABELS = {
  FR: {
    date: 'DATE', time: 'HEURE', address: 'ADRESSE',
    guest: 'SPECTATEUR', tickets: 'BILLETS', seats: 'PLACES', amount: 'MONTANT',
    code: 'CODE DE RÉSERVATION',
    footer: "Présentez ce QR code au personnel du théâtre à l'entrée.",
  },
  RU: {
    date: 'ДАТА', time: 'ВРЕМЯ', address: 'АДРЕС',
    guest: 'ЗРИТЕЛЬ', tickets: 'БИЛЕТЫ', seats: 'МЕСТА', amount: 'СУММА',
    code: 'КОД БРОНИ',
    footer: 'Покажите этот QR-код сотруднику театра при входе.',
  },
  // Транслит — используется когда Inter не загрузился и кириллица недоступна.
  RU_LATIN: {
    date: 'DATA', time: 'VREMYA', address: 'ADRES',
    guest: 'ZRITEL', tickets: 'BILETY', seats: 'MESTA', amount: 'SUMMA',
    code: 'KOD BRONI',
    footer: 'Show this QR code to the theatre staff at the entrance.',
  },
} as const;

/** Та же инструкция, что в письме, — по-английски для всех. */
const PDF_EN_INSTRUCTION = 'Show this QR code to the theatre staff at the entrance.';

/**
 * Штамп оплаты на билете.
 *
 * PDF собирается из той же живой брони, что и кабинет (подписка Firestore),
 * поэтому штамп всегда отражает текущий статус: после подтверждения оплаты
 * следующая загрузка уже «оплачено» — хранимого устаревшего файла нет.
 *
 * null — штампа нет: у отменённой/протухшей брони PDF-билета не бывает.
 * Неоплаченный билет (касса или перевод) получает отдельный янтарный штамп —
 * он не должен выглядеть оплаченным.
 */
export interface TicketPdfStatus {
  tone:  'paid' | 'venue';
  fr:    string;
  ru:    string;
  /** Когда кириллический шрифт недоступен. */
  latin: string;
}

export function ticketPdfStatus(b: Pick<Booking, 'status' | 'paymentStatus' | 'paymentMethod'>): TicketPdfStatus | null {
  const pay = b.paymentStatus ?? 'not_paid';
  if (b.status === 'cancelled' || pay === 'expired') return null;
  if (pay === 'paid') return { tone: 'paid', fr: 'PAYÉ', ru: 'ОПЛАЧЕНО', latin: 'PAID' };
  if (pay === 'awaiting_transfer') {
    return { tone: 'venue', fr: 'EN ATTENTE DE PAIEMENT', ru: 'ОЖИДАЕТ ОПЛАТЫ', latin: 'PAYMENT PENDING' };
  }
  if (pay === 'not_paid') {
    return { tone: 'venue', fr: 'PAIEMENT SUR PLACE', ru: 'ОПЛАТА НА МЕСТЕ', latin: 'PAY AT VENUE' };
  }
  return null;
}

// Возвращает base64 шрифта либо null, если по адресу лежит не шрифт.
// Проверяем и Content-Type, и сигнатуру sfnt: SPA-rewrite отдаёт index.html
// со статусом 200, так что res.ok сам по себе ничего не гарантирует.
async function loadFontBase64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    if (!isPlausibleFontContentType(res.headers.get('content-type'))) {
      console.warn(`[ticketPdf] ${path}: получен не шрифт (content-type), используется запасной вариант`);
      return null;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isSfntFontBinary(bytes)) {
      console.warn(`[ticketPdf] ${path}: файл не является TTF/OTF, используется запасной вариант`);
      return null;
    }

    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  } catch {
    return null;
  }
}

// ── Доставка готового PDF пользователю ───────────────────────────────────────
//
// Документ собирается ОДИН раз (buildTicketPdf), а дальше у зрителя два
// независимых действия над одним и тем же файлом:
//
//   «Скачать PDF»            — Blob URL + <a download>; где атрибут download
//                               не поддерживается — PDF открывается в просмотре;
//   «Поделиться / сохранить» — системный лист Web Share с файлом: на iOS там
//                               «Сохранить в Файлы», AirDrop, почта.
//
// Раньше это была одна кнопка, которая сама решала, что делать, — на Mac она
// открывала лист «Поделиться», и скачать файл напрямую было нельзя.
//
// Выбор пути — только по ВОЗМОЖНОСТЯМ браузера, User-Agent не разбирается.
// Честное ограничение: iOS Safari объявляет download, но для Blob может
// показать просмотр вместо сохранения. Надёжный путь там — «Поделиться».

/** Готовый билет: тот самый файл, который получат и загрузка, и «Поделиться». */
export interface TicketPdf {
  /** File, если конструктор File есть в браузере, иначе Blob. */
  blob: Blob;
  fileName: string;
}

/** Причина, по которой действие с PDF не удалось, — для понятного текста в UI. */
export type TicketPdfErrorKind = 'generate' | 'share' | 'preview-blocked';

export class TicketPdfError extends Error {
  readonly kind: TicketPdfErrorKind;

  constructor(kind: TicketPdfErrorKind, cause?: unknown) {
    super(`ticket pdf: ${kind}`, { cause });
    this.name = 'TicketPdfError';
    this.kind = kind;
  }
}

/** Всё, что не классифицировано явно, — сбой подготовки документа. */
export function ticketPdfErrorKind(err: unknown): TicketPdfErrorKind {
  return err instanceof TicketPdfError ? err.kind : 'generate';
}

/**
 * Стабильное имя файла: ticket-PKX3-E222.pdf. Код билета и так состоит из
 * A–Z, 2–9 и дефиса, но имя уходит в файловую систему — лишнее вырезаем.
 */
export function ticketPdfFileName(ticketCode: string): string {
  const safe = ticketCode.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return `ticket-${safe || 'unknown'}.pdf`;
}

const PDF_MIME = 'application/pdf';

function toPdfFile(blob: Blob, fileName: string): Blob {
  if (typeof File === 'undefined') return blob;
  return blob instanceof File && blob.name === fileName
    ? blob
    : new File([blob], fileName, { type: PDF_MIME });
}

// Navigator.share / canShare объявлены в lib.dom как обязательные, но в реальных
// браузерах их может не быть вовсе — поэтому обращаемся через необязательный вид.
type ShareCapableNavigator = {
  canShare?: (data?: ShareData) => boolean;
  share?:    (data?: ShareData) => Promise<void>;
};

const shareApi = (): ShareCapableNavigator =>
  (typeof navigator === 'undefined' ? {} : navigator) as ShareCapableNavigator;

/** Умеет ли браузер отдать файл в системный лист «Поделиться». */
export function canShareFiles(): boolean {
  if (typeof File === 'undefined') return false;
  const nav = shareApi();
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;

  // canShare обязан проверяться именно с файлом: Android-браузеры объявляют
  // navigator.share, но файлы принимают не все.
  try {
    return nav.canShare({ files: [new File([new Blob()], 'probe.pdf', { type: PDF_MIME })] });
  } catch {
    return false;
  }
}

/** Поддерживает ли браузер атрибут download у ссылки. */
export function canDownloadFiles(): boolean {
  if (typeof document === 'undefined') return false;
  return 'download' in document.createElement('a');
}

/**
 * Что произошло после нажатия «Скачать PDF»:
 * 'downloaded' — отработала ссылка с download (браузер кладёт файл в Загрузки;
 *                iOS Safari может вместо этого показать просмотр);
 * 'opened'     — download не поддерживается, PDF открыт в системном просмотре.
 */
export type DownloadOutcome = 'downloaded' | 'opened';

export function downloadTicketPdf(pdf: TicketPdf): DownloadOutcome {
  const url = URL.createObjectURL(pdf.blob);

  if (canDownloadFiles()) {
    const a = document.createElement('a');
    a.href = url;
    a.download = pdf.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Отзываем не сразу: часть браузеров читает Blob уже после клика.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  }

  // Без download ссылка просто перешла бы на PDF и увела зрителя из кабинета —
  // открываем в новой вкладке, там системный просмотр с кнопкой «Поделиться».
  // 'noopener' не передаём: с ним window.open всегда возвращает null и
  // заблокированное окно не отличить от открытого.
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new TicketPdfError('preview-blocked');
  }
  // Просмотр читает Blob дольше обычной загрузки — даём ему минуту.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'opened';
}

/** 'cancelled' — зритель закрыл системный лист; это не ошибка. */
export type ShareOutcome = 'shared' | 'cancelled';

export async function shareTicketPdf(pdf: TicketPdf): Promise<ShareOutcome> {
  if (!canShareFiles()) throw new TicketPdfError('share');
  try {
    await shareApi().share!({ files: [toPdfFile(pdf.blob, pdf.fileName) as File], title: pdf.fileName });
    return 'shared';
  } catch (err) {
    // Закрытый лист не превращаем ни в ошибку, ни в молчаливую загрузку.
    if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
    throw new TicketPdfError('share', err);
  }
}

/**
 * Собирает PDF-билет. Единственная точка генерации: и «Скачать», и
 * «Поделиться» получают результат этой функции, поэтому QR, код брони и
 * данные спектакля в них не могут разойтись.
 */
export async function buildTicketPdf(
  booking: Booking,
  qrDataUrl: string,
  lang: 'RU' | 'FR' = 'FR',
): Promise<TicketPdf> {
  const { jsPDF: JsPDF } = await import('jspdf');

  const doc    = new JsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W      = 148;
  const MARGIN = 16;
  const isRU   = lang === 'RU';

  // Декоративный заголовок: хотим Bad Russian, но woff/woff2 jsPDF не поддерживает
  // (нужен TTF binary). Ekaterina Velikaya Two — доступный кирилличный TTF того же театрального стиля.
  const DECOR_ID = 'EkaterinaTwoRegular';
  let hasDecorFont = false;
  const b64Decor = await loadFontBase64('/fonts/ekaterinavelikayatwo.ttf');
  if (b64Decor) {
    doc.addFileToVFS(`${DECOR_ID}.ttf`, b64Decor);
    doc.addFont(`${DECOR_ID}.ttf`, DECOR_ID, 'normal');
    hasDecorFont = true;
  }

  // Кириллический шрифт для подписей, имени гостя и футера в режиме RU.
  //
  // Раньше здесь безусловно запрашивался Inter-Regular.ttf, которого в папке
  // public/fonts нет: SPA-rewrite отдавал index.html со статусом 200, проверка
  // res.ok проходила, hasInterFont становился true — и предусмотренная
  // транслитерация (LABELS.RU_LATIN) не включалась НИКОГДА. jsPDF молча глотал
  // ошибку разбора шрифта, и кириллица из билета просто пропадала.
  //
  // Читаемый кириллический шрифт — Liberation Sans (Regular + Bold, лицензия
  // рядом: public/fonts/LICENSE-LiberationSans.txt). Рукописный Ekaterina
  // Velikaya Two остаётся только для названия спектакля: статус, код и
  // инструкция набраны обычным шрифтом, чтобы их легко прочитал любой зритель.
  // Не загрузился — RU-билет печатается латиницей, как раньше.
  const CYRILLIC_BODY_FONT_URL: string | null = '/fonts/LiberationSans-Regular.ttf';
  const CYRILLIC_BOLD_FONT_URL: string | null = '/fonts/LiberationSans-Bold.ttf';

  const CYR_ID = 'CyrillicBody';
  let hasCyrillicFont = false;
  let hasCyrillicBold = false;
  if (isRU && CYRILLIC_BODY_FONT_URL) {
    const [b64Cyr, b64CyrBold] = await Promise.all([
      loadFontBase64(CYRILLIC_BODY_FONT_URL),
      CYRILLIC_BOLD_FONT_URL ? loadFontBase64(CYRILLIC_BOLD_FONT_URL) : Promise.resolve(null),
    ]);
    if (b64Cyr) {
      doc.addFileToVFS(`${CYR_ID}.ttf`, b64Cyr);
      doc.addFont(`${CYR_ID}.ttf`, CYR_ID, 'normal');
      hasCyrillicFont = true;
      if (b64CyrBold) {
        doc.addFileToVFS(`${CYR_ID}-Bold.ttf`, b64CyrBold);
        doc.addFont(`${CYR_ID}-Bold.ttf`, CYR_ID, 'bold');
        hasCyrillicBold = true;
      }
    }
  }

  // Выбираем набор подписей в зависимости от языка и доступности шрифта.
  const L = isRU
    ? (hasCyrillicFont ? LABELS.RU : LABELS.RU_LATIN)
    : LABELS.FR;

  const H = (style: 'normal' | 'bold' | 'italic' = 'normal') =>
    doc.setFont('helvetica', style);

  // Для основного текста, который в RU-режиме может содержать кириллицу.
  const setBodyFont = () => {
    if (isRU && hasCyrillicFont) doc.setFont(CYR_ID, 'normal');
    else H('normal');
  };

  // Имя гостя: кириллица через Inter; иначе — транслит.
  const guestName = (isRU && hasCyrillicFont)
    ? (booking.userName || booking.userEmail || 'Guest')
    : (transliterate(booking.userName).trim() || booking.userEmail || 'Guest');

  let y = 18;

  // Шапка театра
  H('bold');
  doc.setFontSize(14);
  doc.setTextColor(180, 0, 0);
  doc.text('THEATRE TETE-A-TETE', W / 2, y, { align: 'center' });
  y += 5;

  H('normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 146, 140);
  doc.text('24 Rue Rossini  ·  06000 Nice', W / 2, y + 2, { align: 'center' });
  y += 10;

  doc.setDrawColor(215, 205, 195);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 9;

  // Название спектакля: Ekaterina Two для театрального вида,
  // фоллбек — Helvetica bold + транслит.
  const rawTitle = localizedShowTitle(booking, lang) || 'Spectacle';
  doc.setTextColor(28, 24, 22);
  if (hasDecorFont) {
    doc.setFont(DECOR_ID, 'normal');
    doc.setFontSize(16);
    const lines = doc.splitTextToSize(rawTitle, W - MARGIN * 2) as string[];
    doc.text(lines, W / 2, y, { align: 'center' });
    y += lines.length * 9 + 4;
  } else {
    H('bold');
    doc.setFontSize(13);
    const safeTitle = transliterate(rawTitle) || 'Spectacle';
    const lines = doc.splitTextToSize(safeTitle, W - MARGIN * 2) as string[];
    doc.text(lines, W / 2, y, { align: 'center' });
    y += lines.length * 8 + 4;
  }

  doc.setDrawColor(215, 205, 195);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 7;

  // Таблица деталей бронирования
  const labelX  = MARGIN + 2;
  const valueX  = 74;
  const rowStep = 6.4;

  const rows: [string, string][] = [
    [L.date,    formatDateForPdf(booking.showDate)],
    [L.time,    booking.showTime],
    [L.address, '24 Rue Rossini, 06000 Nice'],
    [L.guest,   guestName],
    [L.tickets, String(booking.ticketsCount)],
  ];
  // Несколько тарифов — по строке на тариф под общим числом билетов. Названия
  // тарифов по-русски только с кириллическим шрифтом, иначе — французские (латиница).
  const ticketLines = bookingTicketLines(booking);
  if (ticketLines.length > 1) {
    const labelLang = isRU && hasCyrillicFont ? 'RU' : 'FR';
    for (const l of ticketLines) rows.push(['', `${l.quantity} x ${ticketTypeLabel(l.type, labelLang)}`]);
  }
  // Сколько человек проходит по билету (семейный тариф: один билет — три места).
  rows.push([L.seats, String(booking.seatsCount && booking.seatsCount > 0 ? booking.seatsCount : booking.ticketsCount)]);
  if (booking.totalAmount > 0) rows.push([L.amount, `${booking.totalAmount} EUR`]);
  rows.push([L.code, booking.ticketCode]);

  for (const [label, value] of rows) {
    // Подпись (маленькая серая, uppercase)
    if (isRU && hasCyrillicFont) doc.setFont(CYR_ID, 'normal');
    else H('bold');
    doc.setFontSize(7.5);
    doc.setTextColor(155, 150, 142);
    doc.text(label, labelX, y);

    // Значение: для кода брони — Courier bold, для остального — основной шрифт
    if (label === L.code) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(10);
    } else {
      setBodyFont();
      doc.setFontSize(10);
    }
    doc.setTextColor(28, 24, 22);
    doc.text(value, valueX, y);
    y += rowStep;
  }

  y += 3;
  doc.setDrawColor(215, 205, 195);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 7;

  // Нижний блок в две колонки: слева крупный QR, справа — статус оплаты,
  // код брони и инструкция, что с этим QR делать. Столбиком всё это не
  // помещалось на A5: QR съезжал за край страницы.
  const qrSize  = 60;
  const colX    = MARGIN + qrSize + 8;
  const colW    = W - MARGIN - colX;
  const blockY  = y;
  doc.addImage(qrDataUrl, 'PNG', MARGIN, blockY, qrSize, qrSize);

  let ry = blockY + 1;

  // Шрифт функционального текста: читаемый, без завитков. RU — Liberation
  // Sans (кириллица), FR — Helvetica (WinAnsi умеет акценты).
  const plain = (weight: 'normal' | 'bold') => {
    if (isRU && hasCyrillicFont) doc.setFont(CYR_ID, weight === 'bold' && hasCyrillicBold ? 'bold' : 'normal');
    else H(weight);
  };
  // Без кириллического шрифта RU-билет говорит по-английски, а не транслитом.
  const canPrintLocal = !isRU || hasCyrillicFont;

  // 1. Статус оплаты — компактный бейдж: крупно на языке билета, мелко по-английски.
  const status = ticketPdfStatus(booking);
  if (status) {
    const primary   = !isRU ? status.fr : canPrintLocal ? status.ru : status.latin;
    const secondary = primary === status.latin ? null : status.latin;
    const [r, g, bl]    = status.tone === 'paid' ? [46, 110, 58]   : [150, 98, 16];
    const [fr, fg, fb]  = status.tone === 'paid' ? [232, 243, 234] : [251, 242, 224];

    plain('bold');
    doc.setFontSize(10);
    const primaryW = doc.getTextWidth(primary);
    H('normal');
    doc.setFontSize(7);
    const secondaryW = secondary ? doc.getTextWidth(secondary) : 0;
    const w = Math.min(colW, Math.max(primaryW, secondaryW) + 8);
    const h = secondary ? 12.5 : 8.5;

    doc.setFillColor(fr, fg, fb);
    doc.setDrawColor(r, g, bl);
    doc.setLineWidth(0.5);
    doc.roundedRect(colX, ry, w, h, 1.5, 1.5, 'FD');
    doc.setTextColor(r, g, bl);
    plain('bold');
    doc.setFontSize(10);
    doc.text(primary, colX + 4, ry + 5.6);
    if (secondary) {
      H('normal');
      doc.setFontSize(7);
      doc.text(secondary, colX + 4, ry + 10);
    }
    ry += h + 7;
  }

  // 2. Код брони — его можно продиктовать, если QR не читается.
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 24, 22);
  doc.text(booking.ticketCode, colX, ry + 1);
  ry += 9;

  // 3. Главное: что делать с этим QR — обычным жирным шрифтом.
  const instruction = canPrintLocal ? L.footer : PDF_EN_INSTRUCTION;
  plain('bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 24, 22);
  const lines = doc.splitTextToSize(instruction, colW) as string[];
  doc.text(lines, colX, ry, { lineHeightFactor: 1.25 });
  ry += lines.length * 4.9 + 2.5;

  // 4. Английский дубль — второстепенный: мельче и светлее.
  if (instruction !== PDF_EN_INSTRUCTION) {
    H('normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 116, 110);
    doc.text(doc.splitTextToSize(PDF_EN_INSTRUCTION, colW) as string[], colX, ry, { lineHeightFactor: 1.2 });
  }

  const fileName = ticketPdfFileName(booking.ticketCode);
  return { blob: toPdfFile(doc.output('blob'), fileName), fileName };
}
