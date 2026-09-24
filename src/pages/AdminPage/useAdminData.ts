// Данные админки: загрузка броней и пользователей плюс действия с бронями.
//
// Все изменения броней идут через сервер (/api/admin-booking): он сам читает
// бронь, проверяет, допустим ли переход, пишет аудит и отправляет письмо.
// Браузер больше не пишет в bookings и не отправляет письма.

import { useCallback, useEffect, useState } from 'react';
import { getAllBookings } from '../../services/bookingService';
import { adminBookingMutation, type AdminBookingRequest } from '../../services/adminBookingService';
import { getAllUsers, deleteUserCompletely, type AdminUser } from '../../services/userService';
import { describeStateIssue } from '../../../shared/domain/bookingRules';
import type { Booking, BookingStatus, PaymentStatus } from '../../types/booking';

/**
 * Бессмысленные сочетания статусов не запрещаем — театру может понадобиться
 * починить реальную ситуацию вручную, — но переспрашиваем. Один текст на оба
 * места: разойдясь, формулировки путали бы администратора.
 */
function confirmDespiteStateIssue(status: BookingStatus, paymentStatus: PaymentStatus): boolean {
  const issue = describeStateIssue(status, paymentStatus);
  return !issue || window.confirm(`${issue}.\n\nВсё равно сохранить?`);
}

/** Понятный текст отказа сервера. */
const REFUSALS: Record<string, string> = {
  already_attended:  'Зритель уже прошёл в зал — это действие недоступно.',
  already_cancelled: 'Бронь уже отменена.',
  already_paid:      'Бронь уже отмечена как оплаченная.',
  cancelled:         'Бронь отменена.',
  not_paid:          'Бронь не оплачена.',
  not_cancelled:     'Удалить можно только отменённую бронь.',
  not_found:         'Бронь не найдена — возможно, её уже удалили.',
  // Онлайн-оплата: состояние меняют только Stripe и сервер.
  refund_required:   'Эта бронь оплачена онлайн. Сначала выполните возврат в Stripe Dashboard — после успешного возврата бронь отменится и места освободятся автоматически.',
  online_payment:    'Онлайн-оплату подтверждает Stripe — отметить или снять её вручную нельзя.',
  financial_hold:    'Удалить нельзя: по брони не завершён возврат или оплата требует проверки.',
  payment_processing:'Оплата в Stripe ещё обрабатывается — попробуйте позже.',
  payment_unavailable:'Stripe сейчас недоступен — попробуйте ещё раз через минуту.',
};

export interface AdminData {
  bookings: Booking[];
  users: AdminUser[];
  fetching: boolean;
  /** id брони, по которой сейчас идёт запрос. */
  updatingId: string | null;
  updatingUserId: string | null;
  deleteUserError: string | null;
  dismissDeleteUserError: () => void;
  /** Ошибка действия с бронью — показывается над таблицей и гасится вручную. */
  actionError: string | null;
  /** Итог действия, о котором стоит сказать (например, «билет отправлен»). */
  actionNotice: string | null;
  dismissActionError: () => void;
  /** Перечитать брони и пользователей — список в админке не live. */
  reload: () => void;
  setStatus: (bookingId: string, status: Extract<BookingStatus, 'cancelled'>) => Promise<void>;
  setPaymentStatus: (bookingId: string, paymentStatus: PaymentStatus) => Promise<void>;
  resendTicket: (bookingId: string) => Promise<void>;
  deleteBooking: (bookingId: string) => Promise<void>;
  deleteUser: (uid: string) => Promise<void>;
}

export function useAdminData(enabled: boolean): AdminData {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [updatingId,     setUpdatingId]     = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
  const [actionError,  setActionError]  = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Первичная загрузка. Флаг stale — чтобы ответ отменённой загрузки не затирал
  // состояние. Просроченные переводы аннулирует cron на сервере — админка
  // больше ничего не пишет при открытии.
  useEffect(() => {
    if (!enabled) return;
    let stale = false;

    void (async () => {
      setFetching(true);
      try {
        const [bData, uData] = await Promise.all([getAllBookings(), getAllUsers()]);
        if (stale) return;
        setBookings(bData);
        setUsers(uData);
      } catch {
        if (!stale) setActionError('Не удалось загрузить данные. Проверьте интернет и нажмите «Обновить».');
      } finally {
        if (!stale) setFetching(false);
      }
    })();

    return () => { stale = true; };
  }, [enabled, reloadTick]);

  const reload = useCallback(() => setReloadTick(n => n + 1), []);

  /** Одно действие с бронью: сервер решает, список перечитывается из базы. */
  async function mutate(bookingId: string, request: AdminBookingRequest, fallback: string, notice?: (r: { ticketEmail?: string }) => string | null) {
    if (updatingId === bookingId) return;
    setUpdatingId(bookingId);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await adminBookingMutation(request);
      setActionNotice(notice?.(result) ?? null);
      reload();
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      setActionError(reason && REFUSALS[reason] ? REFUSALS[reason] : `${fallback}: ${(e as Error).message}`);
      // Отказ из-за изменившейся брони — показываем свежее состояние.
      if (reason) reload();
    } finally {
      setUpdatingId(null);
    }
  }

  const emailNotice = (sent: string, r: { ticketEmail?: string }) =>
    r.ticketEmail === 'sent'   ? sent
    : r.ticketEmail === 'failed' ? 'Изменение сохранено, но письмо не ушло — нажмите «Отправить билет» позже.'
    : null;

  async function setStatus(bookingId: string, status: Extract<BookingStatus, 'cancelled'>) {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || booking.status === status) return;
    if (!confirmDespiteStateIssue(status, booking.paymentStatus ?? 'not_paid')) return;
    await mutate(bookingId, { action: 'cancel', bookingId }, 'Не удалось отменить бронь',
      r => emailNotice('Бронь отменена, зрителю отправлено письмо.', r));
  }

  async function setPaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking || (booking.paymentStatus ?? 'not_paid') === paymentStatus) return;

    if (paymentStatus === 'paid') {
      // Оплата — по коду билета, тем же действием, что у кассы на входе.
      // Письмо «оплата получена» с QR отправляет сервер.
      await mutate(bookingId, { action: 'mark_paid', ticketCode: booking.ticketCode }, 'Не удалось отметить оплату',
        r => emailNotice('Оплата отмечена, зрителю отправлен билет.', r));
      return;
    }
    if (!confirmDespiteStateIssue(booking.status, paymentStatus)) return;
    await mutate(bookingId, { action: 'mark_unpaid', bookingId }, 'Не удалось снять оплату');
  }

  async function resendTicket(bookingId: string) {
    await mutate(bookingId, { action: 'resend_ticket', bookingId }, 'Не удалось отправить билет',
      r => r.ticketEmail === 'sent' ? 'Билет отправлен повторно.' : 'Письмо не отправлено — проверьте адрес зрителя.');
  }

  // Удаление отменённой брони. Запись убирается из списка ТОЛЬКО после успеха
  // сервера: оптимистичное удаление оставило бы таблицу и счётчики в состоянии,
  // не совпадающем с базой, если запрос упадёт.
  async function deleteBooking(bookingId: string) {
    if (updatingId === bookingId) return;
    setUpdatingId(bookingId);
    setActionError(null);
    try {
      await adminBookingMutation({ action: 'delete', bookingId });
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      setActionError(reason && REFUSALS[reason] ? REFUSALS[reason]
        : e instanceof Error ? `Ошибка удаления брони: ${e.message}` : 'Ошибка удаления брони');
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteUser(uid: string) {
    setUpdatingUserId(uid);
    setDeleteUserError(null);
    try {
      const result = await deleteUserCompletely(uid);
      setUsers(prev => prev.filter(u => u.uid !== uid));
      if (result.bookingsDeletedCount > 0) {
        setBookings(prev => prev.filter(b => b.userId !== uid));
      }
    } catch (e) {
      setDeleteUserError(e instanceof Error ? e.message : 'Ошибка удаления пользователя');
    } finally {
      setUpdatingUserId(null);
    }
  }

  return {
    bookings, users, fetching,
    updatingId, updatingUserId,
    deleteUserError,
    dismissDeleteUserError: () => setDeleteUserError(null),
    actionError, actionNotice,
    dismissActionError: () => { setActionError(null); setActionNotice(null); },
    reload,
    setStatus, setPaymentStatus, resendTicket, deleteBooking, deleteUser,
  };
}
