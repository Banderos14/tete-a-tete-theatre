// Состояние проверки билета.
//
// Ключевое здесь — lookupByCode: раньше последовательность «разобрать код →
// inspect → показать бронь либо ошибку» была скопирована трижды (переход по
// ссылке из QR, скан камерой, распознавание файла), и формулировки ошибок
// в копиях уже начинали расходиться.

import { useCallback, useState } from 'react';
import type { User } from 'firebase/auth';
import { checkinTicket, type CheckinBooking } from '../../services/checkinService';
import { sendPaymentPaidEmail } from '../../services/email';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';

export type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'error';

const NOT_A_TICKET = 'QR-код не похож на билет Théâtre Tête-à-Tête.';
const LOOKUP_FAILED = 'Ошибка при поиске брони.';

export interface TicketCheck {
  scanState: ScanState;
  booking: CheckinBooking | null;
  errorMsg: string;
  operating: boolean;
  cameraError: string;

  setScanState: (s: ScanState) => void;
  setCameraError: (msg: string) => void;
  /** Ошибка распознавания до обращения к серверу (битый PDF, нет QR в картинке). */
  failWith: (message: string) => void;

  /** Разбирает отсканированный текст и показывает бронь либо ошибку. */
  lookupByCode: (rawScan: string) => Promise<void>;
  markPaid: () => Promise<void>;
  markAttended: () => Promise<void>;

  beginScanning: () => void;
  reset: () => void;
}

export function useTicketCheck(user: User | null, initialState: ScanState): TicketCheck {
  const [scanState,   setScanState]   = useState<ScanState>(initialState);
  const [booking,     setBooking]     = useState<CheckinBooking | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [operating,   setOperating]   = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Единая точка обращения к серверу: и просмотр, и отметка идут через
  // /api/checkin-ticket, где операция выполняется атомарно.
  const callCheckin = useCallback(
    async (code: string, action: 'inspect' | 'mark_attended' | 'mark_paid') => {
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error('no-token');
      return checkinTicket(code, action, idToken);
    },
    [user],
  );

  const failWith = useCallback((message: string) => {
    setErrorMsg(message);
    setScanState('error');
  }, []);

  const lookupByCode = useCallback(async (rawScan: string) => {
    const code = parseTicketCodeFromScan(rawScan);
    if (!code) { failWith(NOT_A_TICKET); return; }

    setScanState('loading');
    try {
      const res = await callCheckin(code, 'inspect');
      if (!res.ok || !res.booking) {
        failWith(res.reason === 'not_found' ? `Билет с кодом ${code} не найден.` : LOOKUP_FAILED);
        return;
      }
      setBooking(res.booking);
      setScanState('found');
    } catch {
      failWith(LOOKUP_FAILED);
    }
  }, [callCheckin, failWith]);

  async function markPaid() {
    if (!booking || operating) return;
    setOperating(true);
    try {
      const res = await callCheckin(booking.ticketCode, 'mark_paid');
      if (res.ok && res.booking) {
        setBooking(res.booking);
        // То же письмо, что отправляет админка: поведение наличной оплаты
        // не должно зависеть от того, откуда её отметили.
        const b = res.booking;
        if (b.userEmail) {
          const adminToken = await user?.getIdToken().catch(() => undefined);
          void sendPaymentPaidEmail({
            userEmail:     b.userEmail,
            userName:      b.userName,
            showTitle:     b.showTitle,
            showDate:      b.showDate,
            showTime:      b.showTime,
            ticketsCount:  b.ticketsCount,
            totalAmount:   b.totalAmount,
            ticketCode:    b.ticketCode,
            bookingStatus: 'confirmed',
            lang:          b.lang,
          }, adminToken).catch(() => {/* письмо не должно ломать проход */});
        }
        return;
      }
      failWith(res.reason === 'already_paid'
        ? 'Эта бронь уже отмечена как оплаченная.'
        : 'Ошибка при подтверждении оплаты.');
    } catch {
      failWith('Ошибка при подтверждении оплаты.');
    } finally {
      setOperating(false);
    }
  }

  async function markAttended() {
    if (!booking || operating) return;
    setOperating(true);
    try {
      const res = await callCheckin(booking.ticketCode, 'mark_attended');
      if (res.ok && res.booking) { setBooking(res.booking); return; }
      // Второй одновременный скан того же кода приходит именно сюда:
      // сервер выполнил проверку и запись одной транзакцией.
      if (res.reason === 'already_attended') {
        setBooking(prev => prev ? { ...prev, status: 'attended' } : prev);
        setErrorMsg('');
        return;
      }
      failWith(res.reason === 'not_paid'
        ? 'Билет не оплачен — проход отмечать нельзя.'
        : 'Ошибка при обновлении статуса.');
    } catch {
      failWith('Ошибка при обновлении статуса.');
    } finally {
      setOperating(false);
    }
  }

  function beginScanning() {
    setCameraError('');
    setBooking(null);
    setErrorMsg('');
    setScanState('scanning');
  }

  function reset() {
    setBooking(null);
    setErrorMsg('');
    setOperating(false);
    setCameraError('');
    setScanState('idle');
  }

  return {
    scanState, booking, errorMsg, operating, cameraError,
    setScanState, setCameraError, failWith,
    lookupByCode, markPaid, markAttended,
    beginScanning, reset,
  };
}
