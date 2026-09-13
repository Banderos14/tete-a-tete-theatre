import { useRef, useState } from 'react';
import type { TicketPdfErrorKind } from '../../../services/ticketPdfService';
import type { Booking } from '../../../types/booking';
import { createTicketPdfRunner, type TicketPdfAction } from './ticketPdfRunner';

/** Состояние кнопок «Скачать PDF» и «Поделиться / сохранить» для одного билета. */
export function useTicketPdf(b: Booking, qrSrc: string, lang: 'RU' | 'FR') {
  const [busy, setBusy]   = useState<TicketPdfAction | null>(null);
  const [error, setError] = useState<TicketPdfErrorKind | null>(null);
  const [openedInPreview, setOpenedInPreview] = useState(false);
  const runner = useRef<ReturnType<typeof createTicketPdfRunner> | null>(null);

  async function run(action: TicketPdfAction) {
    runner.current ??= createTicketPdfRunner();
    const result = await runner.current.run(action, { booking: b, qrSrc, lang }, () => {
      setBusy(action);
      setError(null);
    });
    if (result.status === 'ignored') return;

    setBusy(null);
    if (result.status === 'error') setError(result.kind);
    // 'cancelled' — зритель сам закрыл лист «Поделиться», сообщать не о чем.
    else if (result.outcome === 'opened') setOpenedInPreview(true);
  }

  return {
    busy,
    error,
    openedInPreview,
    download: () => run('download'),
    share:    () => run('share'),
  };
}
