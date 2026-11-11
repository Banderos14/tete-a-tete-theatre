// QR-код спектакля для печатной афиши.
//
// Внутри QR — ТА ЖЕ публичная ссылка, что в рассылке и в кнопке «Копировать
// ссылку» (getShowPublicUrl(productionId)): /#/?show=funtik открывает окно
// постановки с выбором сеанса, у спектакля с одним показом — его карточку.
// Отдельной логики перехода у QR нет.
//
// Размер на бумаге задаёт макет, а не пиксели: 1000 px хватает на чёткую
// печать до ~8 см при 300 dpi — с запасом для маленького QR в углу афиши A4
// (обычно 2,5–4 см). Больше — только тяжелее файл и огромная картинка при
// вставке из буфера. Поле в 4 модуля — обязательная «тишина» вокруг кода.
// Уровень коррекции Q (~25 %) переживает печать, блики и загиб бумаги.

import QRCode from 'qrcode';

export const POSTER_QR_SIZE = 1000;

const QR_OPTIONS = {
  width: POSTER_QR_SIZE,
  margin: 4,
  errorCorrectionLevel: 'Q',
  color: { dark: '#000000', light: '#ffffff' },
} as const;

/** Имя файла для скачивания: «qr-funtik.png». */
export function posterQrFileName(productionId: string): string {
  return `qr-${productionId.replace(/[^a-z0-9-]+/gi, '-')}.png`;
}

/** PNG в виде data URL — для превью в админке. */
export function posterQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, QR_OPTIONS);
}

async function posterQrBlob(url: string): Promise<Blob> {
  const dataUrl = await posterQrDataUrl(url);
  return (await fetch(dataUrl)).blob();
}

/** Скачать PNG с QR. */
export async function downloadPosterQr(url: string, fileName: string): Promise<void> {
  const blobUrl = URL.createObjectURL(await posterQrBlob(url));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

/**
 * Скопировать QR картинкой в буфер обмена; если браузер так не умеет
 * (старый Firefox, нет разрешения) — скачать PNG. Promise с Blob передаётся
 * в ClipboardItem сразу: Safari разрешает запись только в рамках клика.
 */
export async function copyPosterQr(url: string, fileName: string): Promise<'copied' | 'downloaded'> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': posterQrBlob(url) })]);
      return 'copied';
    } catch {
      // Ниже — скачивание файла.
    }
  }
  await downloadPosterQr(url, fileName);
  return 'downloaded';
}
