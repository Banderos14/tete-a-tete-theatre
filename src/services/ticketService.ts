// Ticket code generation.
// Uses crypto.getRandomValues for cryptographic randomness (no Math.random).
// Format: XXXX-XXXX (8 alphanumeric chars, no ambiguous chars like 0/O, 1/I/L).

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateTicketCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => CHARSET[b % CHARSET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

// PDF generation — architecture prepared, library not yet installed.
//
// To enable PDF download:
//   npm install jspdf
// Then uncomment and implement generateTicketPdf below.
//
// export async function generateTicketPdf(booking: Booking): Promise<Blob> {
//   const { jsPDF } = await import('jspdf');
//   const doc = new jsPDF({ unit: 'mm', format: 'a5' });
//   doc.setFont('helvetica', 'normal');
//   doc.text('Théâtre Tête-à-Tête', 20, 20);
//   doc.text(booking.showTitle, 20, 30);
//   doc.text(`${booking.showDate} · ${booking.showTime}`, 20, 40);
//   doc.text(booking.userName, 20, 50);
//   doc.text(`Billets : ${booking.ticketsCount}`, 20, 60);
//   doc.text(`Code : ${booking.ticketCode}`, 20, 70);
//   doc.text('24 Rue Rossini, 06000 Nice', 20, 80);
//   return doc.output('blob');
// }
