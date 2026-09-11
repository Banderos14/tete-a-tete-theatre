// Брони пользователя в кабинете: realtime-подписка, производные списки и
// анимация ухода отменённой карточки.

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { subscribeToUserBookings, expireOverdueBookings } from '../../../services/bookingService';
import { computedIsAttended } from '../../../services/attendanceService';
import type { Booking } from '../../../types/booking';
import type { Lang } from '../../../i18n/translations';

/** Длительность CSS-анимации ухода карточки, мс. */
const DISMISS_ANIMATION_MS = 580;

export interface ProfileBookings {
  bookings: Booking[];
  activeBookings: Booking[];
  attendedBookings: Booking[];
  /** Сколько броней уже стали билетами с QR — для бейджа в навигации. */
  ticketCount: number;
  loading: boolean;
  error: string | null;
  dismissingIds: Set<string>;
  startDismiss: (id: string) => void;
  cancelDismiss: (id: string) => void;
}

export function useProfileBookings(open: boolean, user: User | null, lang: Lang): ProfileBookings {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const unsub = subscribeToUserBookings(
      user.uid,
      (data) => {
        setBookings(data);
        setLoading(false);
        setError(null);

        // Статус attended пишет только админка: правила Firestore не разрешают
        // это обычному пользователю, и прежние попытки молча отклонялись.
        // Отображение посещения считается на лету через computedIsAttended.

        expireOverdueBookings(data, (id) => {
          setBookings(prev => prev.map(b =>
            b.id === id ? { ...b, paymentStatus: 'expired', status: 'cancelled' } : b,
          ));
        }).catch(() => {});
      },
      (err) => {
        console.error('[ProfileDrawer] Firestore subscription failed:', err);
        setBookings([]);
        setLoading(false);
        setError(lang === 'FR'
          ? 'Impossible de charger les billets. Vérifiez votre connexion.'
          : 'Не удалось загрузить билеты. Проверьте доступ к базе.');
      },
    );
    return unsub;
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelDismiss = useCallback((id: string) => {
    setDismissingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const startDismiss = useCallback((id: string) => {
    setDismissingIds(prev => new Set(prev).add(id));
    // Доиграв, карточка снимается с анимации тем же способом, что и при ошибке отмены.
    setTimeout(() => cancelDismiss(id), DISMISS_ANIMATION_MS);
  }, [cancelDismiss]);

  const activeBookings = bookings.filter(b =>
    !computedIsAttended(b) &&
    b.status !== 'cancelled' &&
    b.paymentStatus !== 'expired'
  );
  const attendedBookings = bookings.filter(computedIsAttended);
  const ticketCount = activeBookings.filter(b =>
    b.paymentStatus === 'paid' && b.status === 'confirmed' && !!b.ticketCode
  ).length;

  return {
    bookings, activeBookings, attendedBookings, ticketCount,
    loading, error,
    dismissingIds, startDismiss, cancelDismiss,
  };
}
