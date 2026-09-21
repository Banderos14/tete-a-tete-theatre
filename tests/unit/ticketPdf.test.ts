// «Скачать PDF» и «Поделиться / сохранить» — две операции над ОДНИМ файлом.
//
// Web Share на Mac/iPhone работает хорошо, и его нельзя потерять; но зрителю
// нужна и явная загрузка. Тесты фиксируют: документ собирается один раз, оба
// действия получают один и тот же File, путь выбирается по возможностям
// браузера, а закрытый лист «Поделиться» не считается ошибкой.

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildTicketPdf,
  canDownloadFiles,
  canShareFiles,
  downloadTicketPdf,
  shareTicketPdf,
  ticketPdfErrorKind,
  ticketPdfFileName,
  TicketPdfError,
  type TicketPdf,
} from '../../src/services/ticketPdfService.js';
import { createTicketPdfRunner, type TicketPdfDeps } from '../../src/components/ui/TicketCard/ticketPdfRunner.js';
import { generateTicketQR } from '../../src/services/qrService.js';
import type { Booking } from '../../src/types/booking.js';

const CODE = 'PKX3-E222';

const booking = (patch: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  showId: 'show-1',
  showTitle: 'Спектакль',
  showDate: '17 Май 2026',
  showTime: '19:30',
  userId: 'u1',
  userName: 'Ivan Petrov',
  userEmail: 'ivan@example.com',
  userPhone: '',
  ticketsCount: 2,
  ticketType: 'standard',
  priceInfo: '',
  totalAmount: 40,
  ticketCode: CODE,
  status: 'confirmed',
  paymentMethod: 'on_site',
  paymentStatus: 'paid',
  comment: '',
  createdAt: {} as Booking['createdAt'],
  ...patch,
} as Booking);

const fakePdf = (): TicketPdf => {
  const fileName = ticketPdfFileName(CODE);
  return { blob: new File(['%PDF-1.3'], fileName, { type: 'application/pdf' }), fileName };
};

/** Минимальный DOM для загрузки: ссылка, body и Blob URL. */
function stubDom({ downloadSupported }: { downloadSupported: boolean }) {
  const clicks: { href: string; download: string }[] = [];
  const makeAnchor = () => {
    const a: Record<string, unknown> = {
      href: '', rel: '',
      click() { clicks.push({ href: a.href as string, download: a.download as string }); },
      remove() {},
    };
    if (downloadSupported) a.download = '';
    return a;
  };
  vi.stubGlobal('document', {
    createElement: vi.fn(makeAnchor),
    body: { appendChild: vi.fn() },
  });
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    created.push(blob as Blob);
    return `blob:ticket/${created.length}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { revoked.push(url); });
  return { clicks, created, revoked };
}

function stubShare(share: (data?: ShareData) => Promise<void>, canShare = true) {
  const spy = vi.fn(share);
  vi.stubGlobal('navigator', { share: spy, canShare: () => canShare });
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('имя файла', () => {
  it('стабильное: ticket-КОД.pdf', () => {
    expect(ticketPdfFileName(CODE)).toBe('ticket-PKX3-E222.pdf');
    expect(ticketPdfFileName(CODE)).toBe(ticketPdfFileName(CODE));
  });

  it('в имя не попадает ничего, кроме букв, цифр и дефиса', () => {
    expect(ticketPdfFileName('pkx3-e222')).toBe('ticket-PKX3-E222.pdf');
    expect(ticketPdfFileName('../PKX3/E222 ')).toBe('ticket-PKX3E222.pdf');
    expect(ticketPdfFileName('')).toBe('ticket-unknown.pdf');
  });
});

describe('генерация PDF', () => {
  it('собирает настоящий PDF-файл с кодом билета и стабильным именем', async () => {
    const qr  = await generateTicketQR(CODE);
    const pdf = await buildTicketPdf(booking(), qr, 'FR');

    expect(pdf.fileName).toBe('ticket-PKX3-E222.pdf');
    expect(pdf.blob).toBeInstanceOf(File);
    expect((pdf.blob as File).name).toBe(pdf.fileName);
    expect(pdf.blob.type).toBe('application/pdf');

    const text = Buffer.from(await pdf.blob.arrayBuffer()).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain(CODE);
    // Картинка QR встроена в документ.
    expect(text).toMatch(/\/Subtype \/Image/);
  }, 20_000);

  it('тот же код и тот же QR дают тот же документ — генератору нечему расходиться', async () => {
    const qr = await generateTicketQR(CODE);
    const size = async () => (await buildTicketPdf(booking(), qr, 'RU')).blob.size;
    expect(await size()).toBe(await size());
  }, 20_000);
});

describe('«Скачать PDF»', () => {
  it('desktop: Blob URL → <a download> → click → revokeObjectURL', () => {
    vi.useFakeTimers();
    const dom = stubDom({ downloadSupported: true });
    const pdf = fakePdf();

    expect(canDownloadFiles()).toBe(true);
    expect(downloadTicketPdf(pdf)).toBe('downloaded');

    expect(dom.created).toEqual([pdf.blob]);
    expect(dom.clicks).toEqual([{ href: 'blob:ticket/1', download: 'ticket-PKX3-E222.pdf' }]);
    expect(dom.revoked).toEqual([]);
    vi.advanceTimersByTime(10_000);
    expect(dom.revoked).toEqual(['blob:ticket/1']);
  });

  it('без поддержки download PDF открывается в системном просмотре', () => {
    const dom  = stubDom({ downloadSupported: false });
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal('window', { open });

    expect(canDownloadFiles()).toBe(false);
    expect(downloadTicketPdf(fakePdf())).toBe('opened');
    expect(open).toHaveBeenCalledWith('blob:ticket/1', '_blank');
    expect(dom.clicks).toEqual([]);
  });

  it('заблокированный просмотр — понятная ошибка, а Blob URL не утекает', () => {
    const dom = stubDom({ downloadSupported: false });
    vi.stubGlobal('window', { open: vi.fn(() => null) });

    expect(() => downloadTicketPdf(fakePdf())).toThrow(TicketPdfError);
    expect(dom.revoked).toEqual(['blob:ticket/1']);
    try { downloadTicketPdf(fakePdf()); } catch (err) {
      expect(ticketPdfErrorKind(err)).toBe('preview-blocked');
    }
  });

  it('загрузка не трогает Web Share', () => {
    stubDom({ downloadSupported: true });
    const share = stubShare(async () => {});
    downloadTicketPdf(fakePdf());
    expect(share).not.toHaveBeenCalled();
  });
});

describe('«Поделиться / сохранить»', () => {
  it('поддержка определяется через canShare с файлом', () => {
    const canShare = vi.fn(() => true);
    vi.stubGlobal('navigator', { share: async () => {}, canShare });
    expect(canShareFiles()).toBe(true);
    const arg = canShare.mock.calls[0] as unknown as [ShareData];
    expect(arg[0].files?.[0]).toBeInstanceOf(File);
  });

  it('нет share, canShare или файлы не принимаются — кнопки не будет', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareFiles()).toBe(false);
    vi.stubGlobal('navigator', { share: async () => {} });
    expect(canShareFiles()).toBe(false);
    vi.stubGlobal('navigator', { share: async () => {}, canShare: () => false });
    expect(canShareFiles()).toBe(false);
    vi.stubGlobal('navigator', { share: async () => {}, canShare: () => { throw new TypeError(); } });
    expect(canShareFiles()).toBe(false);
  });

  it('отдаёт в navigator.share ровно тот же File', async () => {
    const share = stubShare(async () => {});
    const pdf = fakePdf();
    expect(await shareTicketPdf(pdf)).toBe('shared');
    const data = share.mock.calls[0]![0]!;
    expect(data.files).toEqual([pdf.blob]);
    expect(data.files![0]).toBe(pdf.blob);
  });

  it('AbortError — пользователь закрыл лист, это не ошибка и не загрузка', async () => {
    const dom = stubDom({ downloadSupported: true });
    stubShare(async () => { throw new DOMException('closed', 'AbortError'); });
    expect(await shareTicketPdf(fakePdf())).toBe('cancelled');
    expect(dom.clicks).toEqual([]);
  });

  it('другой сбой share — ошибка вида «share», без молчаливой загрузки', async () => {
    const dom = stubDom({ downloadSupported: true });
    stubShare(async () => { throw new DOMException('no gesture', 'NotAllowedError'); });
    await expect(shareTicketPdf(fakePdf())).rejects.toMatchObject({ kind: 'share' });
    expect(dom.clicks).toEqual([]);
  });
});

describe('оркестрация кнопок', () => {
  const input = { booking: booking(), qrSrc: 'data:image/png;base64,QR', lang: 'FR' as const };

  function deps(patch: Partial<TicketPdfDeps> = {}) {
    const pdf = fakePdf();
    const d = {
      build:    vi.fn(async () => pdf),
      download: vi.fn(() => 'downloaded' as const),
      share:    vi.fn(async () => 'shared' as const),
      ...patch,
    };
    return { d, pdf };
  }

  it('download и share получают один и тот же сгенерированный файл', async () => {
    const { d, pdf } = deps();
    const runner = createTicketPdfRunner(d);
    await runner.run('download', input);
    await runner.run('share', input);

    expect(d.build).toHaveBeenCalledTimes(1);
    expect(d.build).toHaveBeenCalledWith(input.booking, input.qrSrc, 'FR');
    expect(d.download.mock.calls[0]![0]).toBe(pdf);
    expect((d.share.mock.calls[0] as unknown as [TicketPdf])[0]).toBe(pdf);
  });

  it('пять нажатий подряд — одна генерация, остальные игнорируются', async () => {
    let finish!: (pdf: TicketPdf) => void;
    const { d, pdf } = deps({ build: vi.fn(() => new Promise<TicketPdf>(r => { finish = r; })) });
    const runner  = createTicketPdfRunner(d);
    const onStart = vi.fn();

    const runs = [
      runner.run('download', input, onStart),
      runner.run('download', input, onStart),
      runner.run('share', input, onStart),
      runner.run('download', input, onStart),
      runner.run('share', input, onStart),
    ];
    finish(pdf);
    const results = await Promise.all(runs);

    expect(d.build).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(results.filter(r => r.status === 'ignored')).toHaveLength(4);
    expect(d.download).toHaveBeenCalledTimes(1);
    expect(d.share).not.toHaveBeenCalled();
  });

  it('без готового QR ничего не генерируется', async () => {
    const { d } = deps();
    const result = await createTicketPdfRunner(d).run('download', { ...input, qrSrc: '' });
    expect(result).toEqual({ status: 'ignored' });
    expect(d.build).not.toHaveBeenCalled();
  });

  it('сменился язык или бронь — документ собирается заново', async () => {
    const { d } = deps();
    const runner = createTicketPdfRunner(d);
    await runner.run('download', input);
    await runner.run('download', { ...input, lang: 'RU' });
    await runner.run('download', { ...input, lang: 'RU', booking: booking({ ticketsCount: 3 }) });
    expect(d.build).toHaveBeenCalledTimes(3);
  });

  it('закрытый лист «Поделиться» не превращается в ошибку', async () => {
    const { d } = deps({ share: vi.fn(async () => 'cancelled' as const) });
    const result = await createTicketPdfRunner(d).run('share', input);
    expect(result).toEqual({ status: 'done', outcome: 'cancelled' });
  });

  it('сбой генерации — понятный вид ошибки без stack trace, и повтор генерирует заново', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const build = vi.fn()
      .mockRejectedValueOnce(new Error('jsPDF exploded\n    at stack…'))
      .mockResolvedValueOnce(fakePdf());
    const { d } = deps({ build });
    const runner = createTicketPdfRunner(d);

    expect(await runner.run('download', input)).toEqual({ status: 'error', kind: 'generate' });
    expect(await runner.run('download', input)).toEqual({ status: 'done', outcome: 'downloaded' });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('сбой share отдаётся как «share», и после него кнопки снова доступны', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { d } = deps({ share: vi.fn(async () => { throw new TicketPdfError('share'); }) });
    const runner = createTicketPdfRunner(d);
    expect(await runner.run('share', input)).toEqual({ status: 'error', kind: 'share' });
    expect(await runner.run('download', input)).toEqual({ status: 'done', outcome: 'downloaded' });
    expect(d.build).toHaveBeenCalledTimes(1);
  });
});

describe('штамп оплаты в PDF', () => {
  it('оплачено → PAYÉ / ОПЛАЧЕНО / PAID', async () => {
    const { ticketPdfStatus } = await import('../../src/services/ticketPdfService');
    expect(ticketPdfStatus({ status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'bank_transfer' }))
      .toMatchObject({ tone: 'paid', fr: 'PAYÉ', ru: 'Оплачено', latin: 'PAID' });
  });

  it('оплата на месте — отдельный штамп, а не «оплачено»', async () => {
    const { ticketPdfStatus } = await import('../../src/services/ticketPdfService');
    expect(ticketPdfStatus({ status: 'pending', paymentStatus: 'not_paid', paymentMethod: 'on_site' }))
      .toMatchObject({ tone: 'venue', fr: 'PAIEMENT SUR PLACE' });
  });

  it('отменённая и протухшая бронь штампа не получает', async () => {
    const { ticketPdfStatus } = await import('../../src/services/ticketPdfService');
    expect(ticketPdfStatus({ status: 'cancelled', paymentStatus: 'paid', paymentMethod: 'on_site' })).toBeNull();
    expect(ticketPdfStatus({ status: 'cancelled', paymentStatus: 'expired', paymentMethod: 'bank_transfer' })).toBeNull();
  });

  it('ожидающий перевод — свой штамп «ожидает оплаты», не «оплачено»', async () => {
    const { ticketPdfStatus } = await import('../../src/services/ticketPdfService');
    expect(ticketPdfStatus({ status: 'pending', paymentStatus: 'awaiting_transfer', paymentMethod: 'bank_transfer' }))
      .toMatchObject({ tone: 'venue', fr: 'EN ATTENTE DE PAIEMENT', latin: 'PAYMENT PENDING' });
  });

  it('штамп попадает в сам документ и меняется вместе с бронью', async () => {
    const qr = await generateTicketQR(CODE);
    const text = async (patch: Partial<Booking>) =>
      Buffer.from(await (await buildTicketPdf(booking(patch), qr, 'FR')).blob.arrayBuffer()).toString('latin1');

    expect(await text({ paymentStatus: 'paid' })).toContain('PAYÉ');
    const venue = await text({ paymentStatus: 'not_paid', paymentMethod: 'on_site', status: 'pending' });
    expect(venue).toContain('PAIEMENT SUR PLACE');
    expect(venue).not.toContain('PAYÉ');
  }, 20_000);
});
