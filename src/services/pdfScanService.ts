// Распознавание QR-кода из файла: изображение или PDF.
//
// Вынесено из TicketCheckPage отдельным модулем, чтобы конвейер
// «PDF → страница → PNG → QR» можно было прогонять и проверять независимо
// от админского интерфейса.
//
// pdfjs-dist и html5-qrcode грузятся лениво: обе библиотеки тяжёлые и нужны
// только на странице проверки билетов.

// Конвертирует первую страницу PDF в PNG для сканирования QR.
export async function convertPdfFirstPageToImageFile(pdfFile: File): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

  const bytes = await pdfFile.arrayBuffer();
  const doc   = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page  = await doc.getPage(1);

  // Scale 2.5: QR-код получается достаточно большим для надёжного распознавания
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;

  await page.render({ canvas, viewport }).promise;

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve(new File([blob], 'ticket-page.png', { type: 'image/png' }))
        : reject(new Error('canvas.toBlob returned null')),
      'image/png',
    );
  });
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Читает QR из файла-изображения. Требует в DOM контейнер с указанным id —
// html5-qrcode использует его для внутреннего рендеринга.
export async function scanQrFromImageFile(imageFile: File, containerId: string): Promise<string> {
  const { Html5Qrcode } = await import('html5-qrcode');
  const scanner = new Html5Qrcode(containerId);
  try {
    return await scanner.scanFile(imageFile, false);
  } finally {
    scanner.clear();
  }
}
