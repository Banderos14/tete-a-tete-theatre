import QRCode from 'qrcode';
import { publicTicketUrl, ticketQrPayload } from '../../shared/domain/ticketCode';

/**
 * Адрес сайта для QR-билета. Намеренно без запасного window.location.origin:
 * QR из кабинета на localhost или preview иначе отличался бы от QR в письме.
 */
export function ticketQrSiteBase(): string {
  return (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim() ?? '';
}

/** Содержимое QR — то же, что кладёт в письмо сервер (shared/domain/ticketCode). */
export function ticketQrContent(ticketCode: string): string {
  return ticketQrPayload(ticketCode, ticketQrSiteBase());
}

/**
 * Публичная страница билета (/#/ticket?code=…) — та же, что у кнопки в письме.
 * Открывается без входа в любом браузере; нужна ссылкам внутри PDF.
 */
export function ticketPageUrl(ticketCode: string, lang: 'RU' | 'FR'): string {
  return publicTicketUrl(ticketCode, ticketQrSiteBase(), lang);
}

export async function generateTicketQR(ticketCode: string): Promise<string> {
  return QRCode.toDataURL(ticketQrContent(ticketCode), {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}
