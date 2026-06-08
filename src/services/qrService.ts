import QRCode from 'qrcode';

export async function generateTicketQR(ticketCode: string): Promise<string> {
  const payload = JSON.stringify({ ticketCode });
  return QRCode.toDataURL(payload, {
    width: 200,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
