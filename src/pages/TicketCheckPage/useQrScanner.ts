// Источники QR-кода: камера и файл (картинка либо PDF).
//
// Оба в итоге отдают отсканированный текст в lookupByCode — распознавание
// отделено от того, что делать с найденным билетом.

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { convertPdfFirstPageToImageFile, isPdfFile, scanQrFromImageFile } from '../../services/pdfScanService';
import type { TicketCheck } from './useTicketCheck';

/** Контейнер, который html5-qrcode требует для разбора файла. */
export const FILE_SCANNER_ELEMENT_ID = 'qr-file-scanner';
/** Контейнер живого видоискателя камеры. */
export const CAMERA_ELEMENT_ID = 'qr-reader';

function cameraErrorText(err: unknown): string {
  const msg = String(err).toLowerCase();
  return msg.includes('permission') || msg.includes('notallowed') || msg.includes('denied')
    ? 'Для проверки билетов необходимо разрешить доступ к камере.'
    : 'Не удалось запустить камеру. Попробуйте ещё раз.';
}

/** Держит камеру включённой ровно пока scanState === 'scanning'. */
export function useCameraScanner(check: TicketCheck): void {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Колбэк камеры живёт дольше рендера, поэтому читает состояние через ref —
  // иначе он замкнулся бы на первый рендер и звал устаревший lookupByCode.
  const checkRef = useRef(check);
  useEffect(() => { checkRef.current = check; });

  const active = check.scanState === 'scanning';

  useEffect(() => {
    if (!active) return;

    const scanner = new Html5Qrcode(CAMERA_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (text) => {
        // Камеру гасим до запроса: иначе она продолжит слать тот же кадр,
        // пока сервер отвечает.
        if (scannerRef.current) {
          await scannerRef.current.stop().catch(() => {});
          scannerRef.current = null;
        }
        await checkRef.current.lookupByCode(text);
      },
      () => {},
    ).catch((err) => {
      scannerRef.current = null;
      scanner.clear();
      checkRef.current.setCameraError(cameraErrorText(err));
      checkRef.current.setScanState('idle');
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [active]);
}

/** Распознаёт QR в выбранном файле; PDF предварительно переводится в картинку. */
export async function scanTicketFile(file: File, check: TicketCheck): Promise<void> {
  check.setScanState('loading');

  const isPdf = isPdfFile(file);

  let scanFile = file;
  if (isPdf) {
    try {
      scanFile = await convertPdfFirstPageToImageFile(file);
    } catch {
      check.failWith('Не удалось прочитать PDF. Убедитесь, что файл не повреждён.');
      return;
    }
  }

  let text: string;
  try {
    text = await scanQrFromImageFile(scanFile, FILE_SCANNER_ELEMENT_ID);
  } catch {
    check.failWith(isPdf
      ? 'QR-код не найден в PDF-файле.'
      : 'Не удалось распознать QR-код в изображении.');
    return;
  }

  await check.lookupByCode(text);
}
