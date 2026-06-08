import QRCode from 'qrcode';

function getPublicSiteUrl(): string {
  return (
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    window.location.origin ||
    'https://tete-a-tete-theatre.vercel.app'
  );
}

export async function generateTicketQR(ticketCode: string): Promise<string> {
  const base = getPublicSiteUrl();
  const url = `${base}/#/admin/checkin?ticket=${encodeURIComponent(ticketCode)}`;
  return QRCode.toDataURL(url, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}
