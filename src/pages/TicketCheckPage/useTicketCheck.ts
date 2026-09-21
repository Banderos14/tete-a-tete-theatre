// Состояние проверки билета.
//
// Ключевое здесь — lookupByCode: одна последовательность «разобрать код →
// inspect → показать бронь либо ошибку» для всех источников (ссылка из QR,
// камера, файл, поиск без QR).
//
// Все действия идут в /api/admin-booking вместе со спектаклем, на котором
// стоит сотрудник (showId): сервер сам решает, тот ли это спектакль, и берёт
// сумму к оплате из брони. Письма после оплаты отправляет сервер.

import { useCallback, useState } from 'react';
import { adminBookingAction, type AdminBookingAction, type CheckinBooking, type CheckinGroup } from '../../services/adminBookingService';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';

export type ScanState = 'idle' | 'scanning' | 'loading' | 'found' | 'error';

const NOT_A_TICKET  = 'QR-код не похож на билет Théâtre Tête-à-Tête.';
const LOOKUP_FAILED = 'Ошибка при поиске брони. Проверьте интернет и попробуйте ещё раз.';

/** Понятный текст отказа сервера — одна таблица на все действия. */
function refusalText(reason: string | undefined, fallback: string): string {
  switch (reason) {
    case 'wrong_show':      return 'Билет на другой спектакль — проход на этот спектакль не отмечен.';
    case 'not_paid':        return 'Билет не оплачен — сначала примите оплату.';
    case 'cancelled':       return 'Бронь отменена — пропускать нельзя.';
    case 'expired':         return 'Срок оплаты перевода истёк — бронь аннулирована.';
    case 'already_paid':    return 'Эта бронь уже отмечена как оплаченная.';
    case 'no_group':        return 'Эту бронь нельзя провести одним действием: нажмите «Только принять оплату», затем «Отметить проход».';
    case 'payment_pending': return 'У брони неизвестный статус оплаты — проверьте её в админке.';
    case 'bad_show':        return 'Выберите спектакль, на котором вы проверяете билеты.';
    default:                return fallback;
  }
}

export interface TicketCheck {
  scanState: ScanState;
  booking: CheckinBooking | null;
  /** Все активные брони зрителя на этот спектакль; null — одиночный режим. */
  group: CheckinGroup | null;
  errorMsg: string;
  operating: boolean;
  cameraError: string;
  /**
   * Проход по этой брони отметили только что, на этом экране. Отличает
   * «ПРОХОД ОТМЕЧЕН» от «БИЛЕТ УЖЕ ИСПОЛЬЗОВАН».
   */
  justCheckedIn: boolean;

  setScanState: (s: ScanState) => void;
  setCameraError: (msg: string) => void;
  /** Ошибка распознавания до обращения к серверу (битый PDF, нет QR в картинке). */
  failWith: (message: string) => void;

  /** Разбирает отсканированный текст и показывает бронь либо ошибку. */
  lookupByCode: (rawScan: string) => Promise<void>;
  /** target — бронь из группы; без него действие идёт по отсканированной. */
  markPaid: (target?: CheckinBooking) => Promise<void>;
  markAttended: (target?: CheckinBooking) => Promise<void>;
  /** Оплата (если нужна) и проход всех оставшихся броней группы одним действием. */
  checkInGroup: () => Promise<void>;
  /** Одиночная неоплаченная бронь: принять деньги и пропустить одним действием. */
  payAndCheckIn: () => Promise<void>;

  beginScanning: () => void;
  reset: () => void;
}

/** showId — спектакль, на котором стоит сотрудник. */
export function useTicketCheck(showId: string, initialState: ScanState): TicketCheck {
  const [scanState,   setScanState]   = useState<ScanState>(initialState);
  const [booking,     setBooking]     = useState<CheckinBooking | null>(null);
  const [group,       setGroup]       = useState<CheckinGroup | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [operating,   setOperating]   = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  const call = useCallback(
    (ticketCode: string, action: AdminBookingAction) => adminBookingAction({ action, ticketCode, showId }),
    [showId],
  );

  const failWith = useCallback((message: string) => {
    setErrorMsg(message);
    setScanState('error');
  }, []);

  const lookupByCode = useCallback(async (rawScan: string) => {
    const code = parseTicketCodeFromScan(rawScan);
    if (!code) { failWith(NOT_A_TICKET); return; }

    setScanState('loading');
    setJustCheckedIn(false);
    try {
      const res = await call(code, 'inspect');
      if (!res.ok || !res.booking) {
        failWith(res.reason === 'not_found' ? `Билет с кодом ${code} не найден.` : refusalText(res.reason, LOOKUP_FAILED));
        return;
      }
      setBooking(res.booking);
      setGroup(res.group);
      setScanState('found');
    } catch {
      failWith(LOOKUP_FAILED);
    }
  }, [call, failWith]);

  // После действия над одной бронью группы сводку перечитываем с сервера:
  // суммы и «осталось» считает только он.
  const refreshGroup = useCallback(async () => {
    if (!booking || !group) return;
    const res = await call(booking.ticketCode, 'inspect').catch(() => null);
    if (res?.ok && res.booking) {
      setBooking(res.booking);
      setGroup(res.group);
    }
  }, [booking, group, call]);

  /** Общий каркас действия: одно в полёте, отказ — понятным текстом. */
  async function run(action: () => Promise<void>, fallback: string) {
    setOperating(true);
    try {
      await action();
    } catch {
      failWith(fallback);
    } finally {
      setOperating(false);
    }
  }

  async function markPaid(target?: CheckinBooking) {
    if (!booking || operating) return;
    const subject = target ?? booking;
    await run(async () => {
      const res = await call(subject.ticketCode, 'mark_paid');
      if (res.ok && res.booking) {
        if (group) await refreshGroup();
        else setBooking(res.booking);
        return;
      }
      failWith(refusalText(res.reason, 'Ошибка при подтверждении оплаты.'));
    }, 'Ошибка при подтверждении оплаты.');
  }

  async function markAttended(target?: CheckinBooking) {
    if (!booking || operating) return;
    const subject = target ?? booking;
    await run(async () => {
      const res = await call(subject.ticketCode, 'mark_attended');
      if (res.ok && res.booking) {
        if (group) await refreshGroup();
        else { setBooking(res.booking); setJustCheckedIn(true); }
        return;
      }
      // Второй одновременный скан того же кода: сервер уже отметил проход.
      if (res.reason === 'already_attended' && res.booking) {
        if (group) await refreshGroup();
        else setBooking(res.booking);
        setErrorMsg('');
        return;
      }
      failWith(refusalText(res.reason, 'Ошибка при отметке прохода.'));
    }, 'Ошибка при отметке прохода.');
  }

  // Оплата и проход одной транзакцией на сервере (group_checkin). Для
  // одиночной брони это «Принять XX € и пропустить»: группа из одной брони
  // пишет ровно paidTransition + attendedTransition.
  async function payAndPass(single: boolean) {
    if (!booking || operating) return;
    await run(async () => {
      const res = await call(booking.ticketCode, 'group_checkin');
      if (res.ok && res.booking) {
        setBooking(res.booking);
        setGroup(single ? null : res.group);
        setJustCheckedIn(single);
        return;
      }
      // Отказ несёт свежие данные: второй сотрудник успел провести группу.
      if (res.reason === 'already_attended' && res.booking) {
        setBooking(res.booking);
        if (!single && res.group) setGroup(res.group);
        setErrorMsg('');
        return;
      }
      failWith(refusalText(res.reason, 'Ошибка при оплате и проходе. Отсканируйте билет ещё раз.'));
    }, 'Ошибка при оплате и проходе. Отсканируйте билет ещё раз.');
  }

  const checkInGroup  = () => payAndPass(false);
  const payAndCheckIn = () => payAndPass(true);

  function beginScanning() {
    setJustCheckedIn(false);
    setCameraError('');
    setBooking(null);
    setGroup(null);
    setErrorMsg('');
    setScanState('scanning');
  }

  function reset() {
    setJustCheckedIn(false);
    setBooking(null);
    setGroup(null);
    setErrorMsg('');
    setOperating(false);
    setCameraError('');
    setScanState('idle');
  }

  return {
    scanState, booking, group, errorMsg, operating, cameraError, justCheckedIn,
    setScanState, setCameraError, failWith,
    lookupByCode, markPaid, markAttended, checkInGroup, payAndCheckIn,
    beginScanning, reset,
  };
}
