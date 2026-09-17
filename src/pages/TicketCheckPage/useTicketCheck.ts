// Состояние проверки билета.
//
// Ключевое здесь — lookupByCode: раньше последовательность «разобрать код →
// inspect → показать бронь либо ошибку» была скопирована трижды (переход по
// ссылке из QR, скан камерой, распознавание файла), и формулировки ошибок
// в копиях уже начинали расходиться.

import { useCallback, useState } from 'react';
import type { User } from 'firebase/auth';
import { checkinTicket, type CheckinAction, type CheckinBooking, type CheckinGroup } from '../../services/checkinService';
import { sendPaymentPaidEmail } from '../../services/email';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';

export type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'error';

const NOT_A_TICKET = 'QR-код не похож на билет Théâtre Tête-à-Tête.';
const LOOKUP_FAILED = 'Ошибка при поиске брони.';

export interface TicketCheck {
  scanState: ScanState;
  booking: CheckinBooking | null;
  /** Все активные брони зрителя на этот сеанс; null — одиночный режим. */
  group: CheckinGroup | null;
  errorMsg: string;
  operating: boolean;
  cameraError: string;

  setScanState: (s: ScanState) => void;
  setCameraError: (msg: string) => void;
  /** Ошибка распознавания до обращения к серверу (битый PDF, нет QR в картинке). */
  failWith: (message: string) => void;

  /** Разбирает отсканированный текст и показывает бронь либо ошибку. */
  lookupByCode: (rawScan: string) => Promise<void>;
  /** target — бронь из группы; без него действие идёт по отсканированной. */
  markPaid: (target?: CheckinBooking) => Promise<void>;
  markAttended: (target?: CheckinBooking) => Promise<void>;
  /** Оплата на месте и проход всех оставшихся броней группы одним действием. */
  checkInGroup: () => Promise<void>;

  beginScanning: () => void;
  reset: () => void;
}

export function useTicketCheck(user: User | null, initialState: ScanState): TicketCheck {
  const [scanState,   setScanState]   = useState<ScanState>(initialState);
  const [booking,     setBooking]     = useState<CheckinBooking | null>(null);
  const [group,       setGroup]       = useState<CheckinGroup | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [operating,   setOperating]   = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Единая точка обращения к серверу: и просмотр, и отметка идут через
  // /api/checkin-ticket, где операция выполняется атомарно.
  const callCheckin = useCallback(
    async (code: string, action: CheckinAction) => {
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
      setGroup(res.group);
      setScanState('found');
    } catch {
      failWith(LOOKUP_FAILED);
    }
  }, [callCheckin, failWith]);

  // То же письмо, что отправляет админка: поведение наличной оплаты
  // не должно зависеть от того, откуда её отметили.
  const notifyPaid = useCallback(async (b: CheckinBooking) => {
    if (!b.userEmail) return;
    const adminToken = await user?.getIdToken().catch(() => undefined);
    void sendPaymentPaidEmail({
      userEmail:     b.userEmail,
      userName:      b.userName,
      showId:        b.showId,
      showTitle:     b.showTitle,
      showDate:      b.showDate,
      showTime:      b.showTime,
      ticketsCount:  b.ticketsCount,
      totalAmount:   b.totalAmount,
      ticketCode:    b.ticketCode,
      bookingStatus: 'confirmed',
      lang:          b.lang,
    }, adminToken).catch(() => {/* письмо не должно ломать проход */});
  }, [user]);

  // После действия над одной бронью группы сводку перечитываем с сервера:
  // суммы и «осталось» считает только он.
  const refreshGroup = useCallback(async () => {
    if (!booking || !group) return;
    const res = await callCheckin(booking.ticketCode, 'inspect').catch(() => null);
    if (res?.ok && res.booking) {
      setBooking(res.booking);
      setGroup(res.group);
    }
  }, [booking, group, callCheckin]);

  async function markPaid(target?: CheckinBooking) {
    if (!booking || operating) return;
    const subject = target ?? booking;
    setOperating(true);
    try {
      const res = await callCheckin(subject.ticketCode, 'mark_paid');
      if (res.ok && res.booking) {
        if (group) await refreshGroup();
        else setBooking(res.booking);
        void notifyPaid(res.booking);
        return;
      }
      if (res.reason === 'show_over') {
        failWith('Билет выписан на другой сеанс — оплату принимать нельзя.');
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

  async function markAttended(target?: CheckinBooking) {
    if (!booking || operating) return;
    const subject = target ?? booking;
    setOperating(true);
    try {
      const res = await callCheckin(subject.ticketCode, 'mark_attended');
      if (res.ok && res.booking) {
        if (group) await refreshGroup();
        else setBooking(res.booking);
        return;
      }
      // Второй одновременный скан того же кода приходит именно сюда:
      // сервер выполнил проверку и запись одной транзакцией.
      if (res.reason === 'already_attended') {
        if (group) await refreshGroup();
        else setBooking(prev => prev ? { ...prev, status: 'attended' } : prev);
        setErrorMsg('');
        return;
      }
      if (res.reason === 'show_over') {
        failWith('Билет выписан на другой сеанс — проход отмечать нельзя.');
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

  async function checkInGroup() {
    if (!booking || !group || operating) return;
    setOperating(true);
    try {
      // На сервер уходит только код отсканированного QR: состав группы,
      // суммы и статусы оплаты он заново читает внутри транзакции.
      const res = await callCheckin(booking.ticketCode, 'group_checkin');
      if (res.ok && res.booking && res.group) {
        setBooking(res.booking);
        setGroup(res.group);
        // Письмо — только по броням, которые ЭТОТ запрос перевёл в «оплачено».
        // Повтор получает already_attended без paidBookings, дубля не будет.
        for (const paid of res.paidBookings) void notifyPaid(paid);
        return;
      }
      // Отказ несёт свежую сводку: второй сотрудник успел провести группу,
      // или в группе появилась бронь с неподтверждённым переводом.
      if (res.group && (res.reason === 'already_attended' || res.reason === 'payment_pending')) {
        if (res.booking) setBooking(res.booking);
        setGroup(res.group);
        setErrorMsg('');
        return;
      }
      if (res.reason === 'show_over') {
        failWith('Билет выписан на другой сеанс — проход отмечать нельзя.');
        return;
      }
      if (res.reason === 'cancelled' || res.reason === 'expired') {
        failWith('Отсканированная бронь недействительна — групповой проход недоступен.');
        return;
      }
      failWith('Ошибка при групповом проходе. Отсканируйте билет ещё раз.');
    } catch {
      failWith('Ошибка при групповом проходе. Отсканируйте билет ещё раз.');
    } finally {
      setOperating(false);
    }
  }

  function beginScanning() {
    setCameraError('');
    setBooking(null);
    setGroup(null);
    setErrorMsg('');
    setScanState('scanning');
  }

  function reset() {
    setBooking(null);
    setGroup(null);
    setErrorMsg('');
    setOperating(false);
    setCameraError('');
    setScanState('idle');
  }

  return {
    scanState, booking, group, errorMsg, operating, cameraError,
    setScanState, setCameraError, failWith,
    lookupByCode, markPaid, markAttended, checkInGroup,
    beginScanning, reset,
  };
}
