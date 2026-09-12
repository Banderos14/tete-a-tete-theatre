import QRCode from 'qrcode';
import { getPublicSiteBase } from '../utils/showUrl';

export async function generateTicketQR(ticketCode: string): Promise<string> {
  // Базовый адрес считается тем же местом, что и для ссылок в письмах:
  // VITE_PUBLIC_SITE_URL, иначе текущий origin.
  const base = getPublicSiteBase();
  // Формат /#/ — HashRouter: без него Vercel отдаст 404 при прямом переходе.
  const url = `${base}/#/admin/checkin?ticket=${encodeURIComponent(ticketCode)}`;
  return QRCode.toDataURL(url, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}
