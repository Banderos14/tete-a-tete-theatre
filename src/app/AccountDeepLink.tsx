// Обработка ссылки «Мои билеты» (/#/?account=tickets).
//
// Живёт внутри AuthProvider, потому что решение зависит от того, вошёл ли
// зритель: по ссылке из письма он может прийти и уже авторизованным, и нет.
//
//   авторизован        → сразу открыть кабинет на «Моих билетах»
//   не авторизован     → показать вход и открыть кабинет сразу после него
//
// Компонент ничего не рисует: это правило навигации, а не UI.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccountSectionFromLocation, clearAccountParam } from '../utils/accountUrl';

export function AccountDeepLink({ onOpenTickets, onRequireAuth }: {
  onOpenTickets: () => void;
  onRequireAuth: () => void;
}) {
  const { user, loading } = useAuth();

  // Параметр читается один раз при монтировании: дальше решает стейт, а не адрес.
  const [pending, setPending] = useState(() => getAccountSectionFromLocation() === 'tickets');

  useEffect(() => {
    // Пока роль и сессия не дорезолвились, «не авторизован» ещё не факт.
    if (!pending || loading) return;

    if (user) {
      onOpenTickets();
      clearAccountParam();
      // Намерение одноразовое: кабинет открыт, второй раз срабатывать не должно.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(false);
      return;
    }

    // Ждём входа: намерение сохраняется, и как только появится user,
    // эффект повторится и откроет нужный раздел.
    onRequireAuth();
  }, [pending, loading, user, onOpenTickets, onRequireAuth]);

  return null;
}
