// Данные админки: загрузка броней и пользователей плюс изменения их статусов.
// Письма уходят «в фоне» — их сбой не должен откатывать уже сохранённый статус.

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  getAllBookings, updateBookingStatus, updatePaymentStatus, markBookingPaid,
  expireOverdueBookings, deleteCancelledBooking,
} from '../../services/bookingService';
import { getAllUsers, deleteUserCompletely, type AdminUser } from '../../services/userService';
import { sendBookingStatusUpdateEmail, sendPaymentPaidEmail } from '../../services/email';
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

export interface AdminData {
  bookings: Booking[];
  users: AdminUser[];
  fetching: boolean;
  /** id брони, по которой сейчас идёт запись. */
  updatingId: string | null;
  updatingUserId: string | null;
  deleteUserError: string | null;
  dismissDeleteUserError: () => void;
  /** Ошибка удаления брони — показывается над таблицей и гасится вручную. */
  deleteBookingError: string | null;
  dismissDeleteBookingError: () => void;
  setStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  setPaymentStatus: (bookingId: string, paymentStatus: PaymentStatus) => Promise<void>;
  deleteBooking: (bookingId: string) => Promise<void>;
  deleteUser: (uid: string) => Promise<void>;
}

export function useAdminData(enabled: boolean, user: User | null): AdminData {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [updatingId,     setUpdatingId]     = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
  const [deleteBookingError, setDeleteBookingError] = useState<string | null>(null);

  // Первичная загрузка. Флаг stale — чтобы ответ отменённой загрузки не затирал
  // состояние: без него быстрый уход со страницы или повторный вход админом
  // применял бы результат уже неактуального запроса.
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

        // Посещение здесь НЕ проставляется: статус attended ставит только
        // check-in по QR (см. shared/domain/bookingRules.ts).

        // Просроченные банковские переводы отменяются фоном.
        expireOverdueBookings(bData, (id) => {
          if (stale) return;
          setBookings(prev => prev.map(b =>
            b.id === id ? { ...b, paymentStatus: 'expired', status: 'cancelled' } : b,
          ));
        }).catch(() => {});
      } finally {
        if (!stale) setFetching(false);
      }
    })();

    return () => { stale = true; };
  }, [enabled]);

  /** Токен админа для серверной проверки роли при отправке письма. */
  const adminToken = useCallback(
    () => user?.getIdToken().catch(() => undefined) ?? Promise.resolve(undefined),
    [user],
  );

  async function setStatus(bookingId: string, status: BookingStatus) {
    const booking = bookings.find(b => b.id === bookingId);
    // Если статус не изменился, письмо повторно не отправляем.
    if (!booking || booking.status === status) return;

    if (!confirmDespiteStateIssue(status, booking.paymentStatus ?? 'not_paid')) return;

    setUpdatingId(bookingId);
    try {
      await updateBookingStatus(bookingId, status);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));

      // Письма отправляются только для ручного подтверждения и отмены.
      if (status === 'confirmed' || status === 'cancelled') {
        sendBookingStatusUpdateEmail({
          userEmail:    booking.userEmail,
          userName:     booking.userName,
          showId:       booking.showId,
          showTitle:    booking.showTitle,
          showDate:     booking.showDate,
          showTime:     booking.showTime,
          ticketsCount: booking.ticketsCount,
          totalAmount:  booking.totalAmount,
          ticketCode:   booking.ticketCode,
          newStatus:    status,
          lang:         booking.lang ?? 'FR',
        }, await adminToken()).catch(() => {});
      }
    } finally { setUpdatingId(null); }
  }

  async function setPaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    const booking = bookings.find(b => b.id === bookingId);
    // Если статус оплаты не изменился, письмо повторно не отправляем.
    if (!booking || (booking.paymentStatus ?? 'not_paid') === paymentStatus) return;

    setUpdatingId(bookingId);
    try {
      if (paymentStatus === 'paid') {
        // Оплата и подтверждение должны записываться одним обновлением.
        await markBookingPaid(bookingId);
        setBookings(prev => prev.map(b =>
          b.id === bookingId ? { ...b, paymentStatus: 'paid', status: 'confirmed' } : b
        ));
        // Одно письмо на получение оплаты.
        sendPaymentPaidEmail({
          userEmail:     booking.userEmail,
          userName:      booking.userName,
          showId:        booking.showId,
          showTitle:     booking.showTitle,
          showDate:      booking.showDate,
          showTime:      booking.showTime,
          ticketsCount:  booking.ticketsCount,
          totalAmount:   booking.totalAmount,
          ticketCode:    booking.ticketCode,
          bookingStatus: 'confirmed',
          lang:          booking.lang ?? 'FR',
        }, await adminToken()).catch(() => {});
      } else {
        // Снятие оплаты меняет только paymentStatus и не отправляет письмо.
        if (!confirmDespiteStateIssue(booking.status, paymentStatus)) return;
        await updatePaymentStatus(bookingId, paymentStatus);
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, paymentStatus } : b));
      }
    } finally { setUpdatingId(null); }
  }

  // Удаление отменённой брони. Запись убирается из списка ТОЛЬКО после успеха
  // сервера: оптимистичное удаление оставило бы таблицу и счётчики в состоянии,
  // не совпадающем с базой, если запрос упадёт.
  async function deleteBooking(bookingId: string) {
    if (updatingId === bookingId) return;
    setUpdatingId(bookingId);
    setDeleteBookingError(null);
    try {
      await deleteCancelledBooking(bookingId);
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    } catch (e) {
      setDeleteBookingError(e instanceof Error ? e.message : 'Ошибка удаления брони');
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
    deleteBookingError,
    dismissDeleteBookingError: () => setDeleteBookingError(null),
    setStatus, setPaymentStatus, deleteBooking, deleteUser,
  };
}
