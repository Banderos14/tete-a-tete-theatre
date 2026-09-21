// QR переживает скриншот, а PDF — телефон.
//
// Зритель вправе просто сфотографировать экран кабинета: QR не должен зависеть
// ни от времени, ни от сессии, ни от какого-либо одноразового состояния —
// только от ticketCode, который лежит в брони. Если бы в код попадал nonce,
// скриншот переставал бы сканироваться, а зритель узнавал бы об этом у двери.

import { describe, it, expect } from 'vitest';
import { generateTicketQR } from '../../src/services/qrService.js';
import { parseTicketCodeFromScan } from '../../src/utils/parseTicketCode.js';
import { projectSource, screenSource } from '../helpers/serverSource.js';

const CODE  = 'ABCD-2345';
const OTHER = 'WXYZ-6789';

describe('QR строится только из сохранённого ticketCode', () => {
  it('два вызова подряд дают идентичный QR — одноразового состояния в нём нет', async () => {
    const first  = await generateTicketQR(CODE);
    const second = await generateTicketQR(CODE);
    expect(second).toBe(first);
  });

  it('QR остаётся тем же и «через сутки» — времени в коде нет', async () => {
    const before = await generateTicketQR(CODE);
    const after  = await new Promise<string>(resolve => {
      setTimeout(() => void generateTicketQR(CODE).then(resolve), 5);
    });
    expect(after).toBe(before);
  });

  it('разные брони дают разные QR', async () => {
    expect(await generateTicketQR(OTHER)).not.toBe(await generateTicketQR(CODE));
  });

  it('скриншот сканируется так же, как QR в кабинете: ссылка разбирается обратно в код', () => {
    // Картинка — это всего лишь та же ссылка; сканер приводит её к коду.
    const url = `https://www.theatre-teteatete.fr/#/admin/checkin?ticket=${CODE}`;
    expect(parseTicketCodeFromScan(url)).toBe(CODE);
    expect(parseTicketCodeFromScan(CODE)).toBe(CODE);
  });

  it('в ссылку не подмешивается ничего, кроме кода', () => {
    // Формат ссылки общий для кабинета, PDF и письма — живёт в shared.
    const shared = projectSource('shared/domain/ticketCode.ts');
    expect(shared).toContain('ticket=${encodeURIComponent(ticketCode)}');
    const src = projectSource('src/services/qrService.ts');
    expect(src).toContain('ticketQrPayload(');
    for (const volatile of ['Date.now', 'Math.random', 'crypto', 'token', 'uid']) {
      expect(src, volatile).not.toContain(volatile);
      expect(shared, volatile).not.toContain(volatile);
    }
  });

  it('QR в кабинете рисуется по коду брони, а не по состоянию экрана', () => {
    expect(screenSource('src/components/ui/TicketCard'))
      .toContain('generateTicketQR(b.ticketCode)');
  });
});

describe('PDF сохраняется и на телефоне', () => {
  const pdf = projectSource('src/services/ticketPdfService.ts');

  it('файл отдаётся как Blob, а не через jsPDF.save()', () => {
    // doc.save() — это клик по <a download>, а его iOS Safari игнорирует.
    expect(pdf).toContain("doc.output('blob')");
    expect(pdf).not.toContain('doc.save(');
  });

  it('путь выбирается по возможностям браузера, а не по User-Agent', () => {
    expect(pdf).toContain('canShare');
    expect(pdf).toContain('navigator');
    expect(pdf).not.toMatch(/navigator\.userAgent/);
    expect(screenSource('src/components/ui/TicketCard')).not.toMatch(/userAgent/);
  });

  it('canShare проверяется именно с файлом', () => {
    expect(pdf).toMatch(/canShare\(\{ files:/);
  });

  it('загрузка идёт через Blob URL и <a download>', () => {
    expect(pdf).toContain('createObjectURL');
    expect(pdf).toContain('a.download = pdf.fileName');
    expect(pdf).toContain('revokeObjectURL');
  });

  it('закрытый системный лист не превращается в молчаливую загрузку', () => {
    expect(pdf).toContain("'AbortError'");
  });

  it('«Скачать» и «Поделиться» — две отдельные кнопки, обе локализованы', () => {
    const card = screenSource('src/components/ui/TicketCard');
    expect(card).toContain('onClick={pdf.download}');
    expect(card).toContain('onClick={pdf.share}');
    expect(card).toContain('t.ticketPdf.download');
    expect(card).toContain('t.ticketPdf.share');
    expect(projectSource('src/i18n/ru.ts')).toContain("'Скачать PDF'");
    expect(projectSource('src/i18n/ru.ts')).toContain("'Поделиться / сохранить'");
    expect(projectSource('src/i18n/fr.ts')).toContain("'Télécharger le PDF'");
    expect(projectSource('src/i18n/fr.ts')).toContain("'Partager / enregistrer'");
  });

  it('в PDF попадает тот же QR, что показан в кабинете', () => {
    // PDF — удобство, а не условие прохода: он печатает уже готовый qrSrc.
    expect(screenSource('src/components/ui/TicketCard'))
      .toContain('useTicketPdf(b, qrSrc, lang)');
    expect(projectSource('src/components/ui/TicketCard/useTicketPdf.ts'))
      .toContain('booking: b, qrSrc, lang');
  });
});
