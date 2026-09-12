// Распознавание QR-кода из файла: изображение или PDF.
//
// Вынесено из TicketCheckPage отдельным модулем, чтобы конвейер
// «PDF → страница → PNG → QR» можно было прогонять и проверять независимо
// от админского интерфейса.
//
// pdfjs-dist и html5-qrcode грузятся лениво: обе библиотеки тяжёлые и нужны
// только на странице проверки билетов.

// Адрес воркера pdfjs. Берётся через ?url — так Vite отдаёт файл и в сборке,
// и в dev-режиме.
//
// Раньше здесь было new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).
// Сборщик такой путь переписывал, а dev-сервер — нет: запрос уходил на
// /src/services/pdfjs-dist/build/pdf.worker.min.mjs, SPA-rewrite отвечал на него
// index.html со статусом 200, и pdfjs получал HTML вместо воркера. Ошибки при
// этом не возникало — разбор PDF просто не завершался никогда.
//
// Импорт ничего не весит: в бандл попадает только строка с адресом,
// сам воркер остаётся отдельным файлом и грузится по требованию.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Сколько ждём разбор PDF, мс. Ограничение обязательно: если воркер почему-то
// не поднялся, pdfjs не отвечает и не падает, а сотрудник на входе остаётся
// со спиннером без выхода. Лучше честное сообщение, чем зависший экран.
const PDF_PARSE_TIMEOUT_MS = 15_000;

/** Отклоняет обещание, если оно не успело за отведённое время. */
async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

// Конвертирует первую страницу PDF в PNG для сканирования QR.
export async function convertPdfFirstPageToImageFile(pdfFile: File): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const bytes = await pdfFile.arrayBuffer();
  const task  = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });

  let doc;
  try {
    doc = await withTimeout(task.promise, PDF_PARSE_TIMEOUT_MS, 'pdf parse timeout');
  } catch (err) {
    // Незавершённую задачу обязательно закрываем: иначе висящий воркер
    // останется висеть и на следующем скане.
    void task.destroy().catch(() => {});
    throw err;
  }

  const page = await doc.getPage(1);

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
