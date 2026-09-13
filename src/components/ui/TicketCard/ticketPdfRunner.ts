// Оркестрация действий с PDF-билетом — без React, чтобы правила проверялись тестом.
//
// - Документ генерируется один раз и переиспользуется обоими действиями:
//   «Скачать» и «Поделиться» отдают один и тот же файл.
// - Пока идёт генерация или доставка, повторные нажатия игнорируются — пять
//   нажатий не запускают пять генераций.
// - Кеш важен и для iOS: генерация съедает время «жеста пользователя», и
//   share() может отказать. Повторное нажатие берёт готовый файл и открывает
//   лист сразу.

import {
  buildTicketPdf,
  downloadTicketPdf,
  shareTicketPdf,
  ticketPdfErrorKind,
  type DownloadOutcome,
  type ShareOutcome,
  type TicketPdf,
  type TicketPdfErrorKind,
} from '../../../services/ticketPdfService';
import type { Booking } from '../../../types/booking';

export type TicketPdfAction = 'download' | 'share';

export interface TicketPdfInput {
  booking: Booking;
  qrSrc: string;
  lang: 'RU' | 'FR';
}

export interface TicketPdfDeps {
  build:    (booking: Booking, qrSrc: string, lang: 'RU' | 'FR') => Promise<TicketPdf>;
  download: (pdf: TicketPdf) => DownloadOutcome;
  share:    (pdf: TicketPdf) => Promise<ShareOutcome>;
}

export type TicketPdfRunResult =
  | { status: 'ignored' }
  | { status: 'done'; outcome: DownloadOutcome | ShareOutcome }
  | { status: 'error'; kind: TicketPdfErrorKind };

const defaultDeps: TicketPdfDeps = {
  build:    buildTicketPdf,
  download: downloadTicketPdf,
  share:    shareTicketPdf,
};

export function createTicketPdfRunner(deps: TicketPdfDeps = defaultDeps) {
  let inFlight = false;
  let cache: (TicketPdfInput & { promise: Promise<TicketPdf> }) | null = null;

  function getPdf({ booking: b, qrSrc, lang }: TicketPdfInput): Promise<TicketPdf> {
    if (cache && cache.booking === b && cache.qrSrc === qrSrc && cache.lang === lang) return cache.promise;

    const entry = { booking: b, qrSrc, lang, promise: deps.build(b, qrSrc, lang) };
    cache = entry;
    // Неудачную генерацию не кешируем — следующее нажатие попробует заново.
    entry.promise.catch(() => { if (cache === entry) cache = null; });
    return entry.promise;
  }

  /**
   * onStart вызывается синхронно, только если действие действительно
   * запущено, — UI включает загрузку, не дожидаясь генерации.
   */
  async function run(
    action: TicketPdfAction,
    input: TicketPdfInput,
    onStart?: () => void,
  ): Promise<TicketPdfRunResult> {
    if (!input.qrSrc || inFlight) return { status: 'ignored' };
    inFlight = true;
    onStart?.();
    try {
      const pdf = await getPdf(input);
      const outcome = action === 'download' ? deps.download(pdf) : await deps.share(pdf);
      return { status: 'done', outcome };
    } catch (err) {
      console.error('[ticketPdf]', err);
      return { status: 'error', kind: ticketPdfErrorKind(err) };
    } finally {
      inFlight = false;
    }
  }

  return { run };
}
