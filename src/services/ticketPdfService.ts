import type { Booking } from '../types/booking';

// Cyrillic → Latin transliteration so jsPDF Helvetica never outputs "?".
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

// Replace Cyrillic with Latin equivalents; drop any remaining non-Latin-1 chars.
function sanitizePdfText(text: string): string {
  return text.split('').map(ch => {
    if (CYR[ch] !== undefined) return CYR[ch];
    return ch.charCodeAt(0) > 0xFF ? '' : ch;
  }).join('');
}

export async function generateTicketPdf(booking: Booking, qrDataUrl: string): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W = 148; // A5 width mm

  let y = 18;

  // ── Theatre header ────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(184, 0, 0);
  doc.text('THEATRE TETE-A-TETE', W / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 146, 140);
  doc.text('24 Rue Rossini  06000 Nice', W / 2, y + 2, { align: 'center' });
  y += 10;

  doc.setDrawColor(220, 210, 200);
  doc.setLineWidth(0.5);
  doc.line(15, y, W - 15, y);
  y += 8;

  // ── Show title ────────────────────────────────────────────────────────────

  const titleText = sanitizePdfText(booking.showTitle);
  const titleLines = doc.splitTextToSize(titleText, W - 30) as string[];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 26, 24);
  doc.text(titleLines, W / 2, y, { align: 'center' });
  y += titleLines.length * 7 + 6;

  // ── Details table ─────────────────────────────────────────────────────────

  const labelX = 18;
  const valueX = 75;

  const rows: [string, string][] = [
    ['Date',        booking.showDate],
    ['Heure',       booking.showTime],
    ['Lieu',        '24 Rue Rossini, 06000 Nice'],
    ['Spectateur',  sanitizePdfText(booking.userName)],
    ['Billets',     String(booking.ticketsCount)],
  ];
  if (booking.totalAmount > 0) {
    rows.push(['Montant', `${booking.totalAmount} EUR`]);
  }
  rows.push(['Code', booking.ticketCode]);

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(160, 156, 148);
    doc.text(label.toUpperCase(), labelX, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 26, 24);
    doc.text(value, valueX, y);
    y += 8;
  }

  y += 4;
  doc.setDrawColor(220, 210, 200);
  doc.setLineWidth(0.3);
  doc.line(15, y, W - 15, y);
  y += 8;

  // ── QR code ───────────────────────────────────────────────────────────────

  const qrSize = 62;
  const qrX = (W - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
  y += qrSize + 7;

  // ── Ticket code ───────────────────────────────────────────────────────────

  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 26, 24);
  doc.text(booking.ticketCode, W / 2, y, { align: 'center' });
  y += 7;

  doc.setDrawColor(220, 210, 200);
  doc.setLineWidth(0.3);
  doc.line(15, y, W - 15, y);
  y += 6;

  // ── Footer ────────────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(150, 146, 140);
  doc.text("Presentez ce billet a l'entree.", W / 2, y, { align: 'center' });

  doc.save(`ticket-${booking.ticketCode}.pdf`);
}
