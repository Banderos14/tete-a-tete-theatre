import type { Booking } from '../types/booking';

// ── Cyrillic → Latin transliteration ─────────────────────────────────────────
// Used only as a last-resort fallback when Cyrillic fonts fail to load.
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

// Convert "17 Май 2026" → "17.05.2026" (avoids Cyrillic month names in Helvetica).
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
  // Unknown format — transliterate so Helvetica never sees raw Cyrillic.
  return transliterate(showDate).trim() || showDate;
}

// ── Localised label sets ───────────────────────────────────────────────────────
// FR uses Latin-1 accents (é, à, è) which Helvetica WinAnsi supports natively.
// RU uses Cyrillic — rendered with Inter when loaded, or the RU_FALLBACK set
// (transliterated ASCII) when Inter fails.
const LABELS = {
  FR: {
    date: 'DATE', time: 'HEURE', address: 'ADRESSE',
    guest: 'SPECTATEUR', tickets: 'BILLETS', amount: 'MONTANT',
    code: 'CODE DE RÉSERVATION',
    footer: "Présentez ce billet à l'entrée.",
  },
  RU: {
    date: 'ДАТА', time: 'ВРЕМЯ', address: 'АДРЕС',
    guest: 'ЗРИТЕЛЬ', tickets: 'БИЛЕТЫ', amount: 'СУММА',
    code: 'КОД БРОНИ',
    footer: 'Предъявите этот билет на входе.',
  },
  // Fallback used when Inter font failed to load and Cyrillic can't be rendered.
  RU_LATIN: {
    date: 'DATA', time: 'VREMYA', address: 'ADRES',
    guest: 'ZRITEL', tickets: 'BILETY', amount: 'SUMMA',
    code: 'KOD BRONI',
    footer: 'Predyavite etot bilet na vkhode.',
  },
} as const;

// ── Runtime font loader ───────────────────────────────────────────────────────
async function loadFontBase64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk)
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateTicketPdf(
  booking: Booking,
  qrDataUrl: string,
  lang: 'RU' | 'FR' = 'FR',
): Promise<void> {
  const { jsPDF: JsPDF } = await import('jspdf');

  const doc    = new JsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W      = 148;
  const MARGIN = 16;
  const isRU   = lang === 'RU';

  // ── Font: decorative title ────────────────────────────────────────────────
  // We want "Bad Russian" here, but bad-russian.woff/woff2 cannot be embedded
  // in jsPDF (which requires raw TTF binary). Ekaterina Velikaya Two is the
  // available decorative Cyrillic font in TTF format — same theatrical style.
  const DECOR_ID = 'EkaterinaTwoRegular';
  let hasDecorFont = false;
  const b64Decor = await loadFontBase64('/fonts/ekaterinavelikayatwo.ttf');
  if (b64Decor) {
    doc.addFileToVFS(`${DECOR_ID}.ttf`, b64Decor);
    doc.addFont(`${DECOR_ID}.ttf`, DECOR_ID, 'normal');
    hasDecorFont = true;
  }

  // ── Font: Cyrillic body (RU mode only) ────────────────────────────────────
  // Inter-Regular covers the full Cyrillic block and is available as TTF.
  // Used for RU labels, guest name, and footer.
  const INTER_ID = 'InterRegular';
  let hasInterFont = false;
  if (isRU) {
    const b64Inter = await loadFontBase64('/fonts/Inter-Regular.ttf');
    if (b64Inter) {
      doc.addFileToVFS(`${INTER_ID}.ttf`, b64Inter);
      doc.addFont(`${INTER_ID}.ttf`, INTER_ID, 'normal');
      hasInterFont = true;
    }
  }

  // Pick the label set for this language + font availability.
  const L = isRU
    ? (hasInterFont ? LABELS.RU : LABELS.RU_LATIN)
    : LABELS.FR;

  // Helpers
  const H = (style: 'normal' | 'bold' | 'italic' = 'normal') =>
    doc.setFont('helvetica', style);

  // For body text that may contain Cyrillic in RU mode.
  const setBodyFont = () => {
    if (isRU && hasInterFont) doc.setFont(INTER_ID, 'normal');
    else H('normal');
  };

  // Guest name: use original if Inter renders Cyrillic; otherwise transliterate.
  const guestName = (isRU && hasInterFont)
    ? (booking.userName || booking.userEmail || 'Guest')
    : (transliterate(booking.userName).trim() || booking.userEmail || 'Guest');

  let y = 18;

  // ── Theatre header ────────────────────────────────────────────────────────
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

  // ── Show title ────────────────────────────────────────────────────────────
  // Ekaterina Two renders the Cyrillic title in a theatrical style.
  // Fallback: Helvetica bold + transliterate (no Cyrillic in PDF).
  const rawTitle = booking.showTitle || 'Spectacle';
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

  // ── Details table ─────────────────────────────────────────────────────────
  const labelX  = MARGIN + 2;
  const valueX  = 74;
  const rowStep = 7.5;

  const rows: [string, string][] = [
    [L.date,    formatDateForPdf(booking.showDate)],
    [L.time,    booking.showTime],
    [L.address, '24 Rue Rossini, 06000 Nice'],
    [L.guest,   guestName],
    [L.tickets, String(booking.ticketsCount)],
  ];
  if (booking.totalAmount > 0) rows.push([L.amount, `${booking.totalAmount} EUR`]);
  rows.push([L.code, booking.ticketCode]);

  for (const [label, value] of rows) {
    // Label (small grey uppercase)
    if (isRU && hasInterFont) doc.setFont(INTER_ID, 'normal');
    else H('bold');
    doc.setFontSize(7.5);
    doc.setTextColor(155, 150, 142);
    doc.text(label, labelX, y);

    // Value: Courier bold for ticket code, body font for everything else
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

  // ── QR code ───────────────────────────────────────────────────────────────
  const qrSize = 66;
  doc.addImage(qrDataUrl, 'PNG', (W - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 6;

  // ── Ticket code ───────────────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(28, 24, 22);
  doc.text(booking.ticketCode, W / 2, y, { align: 'center' });
  y += 6;

  doc.setDrawColor(215, 205, 195);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 6;

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(8.5);
  doc.setTextColor(150, 146, 140);
  if (isRU && hasInterFont) doc.setFont(INTER_ID, 'normal');
  else H('italic');
  doc.text(L.footer, W / 2, y, { align: 'center' });

  doc.save(`ticket-${booking.ticketCode}.pdf`);
}
