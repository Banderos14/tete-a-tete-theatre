// Подтверждения необратимых действий админки.
//
// Все четыре живут в одном месте: они различаются только текстом и тем, какой
// обработчик дёргают, а раскиданные по вкладкам — расходились бы формулировками.

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { ConfirmAction } from './adminTypes';

export function AdminConfirmDialogs({
  action, onClose, updatingId, updatingUserId,
  onSetPaymentStatus, onSetStatus, onDeleteUser,
}: {
  action: ConfirmAction;
  onClose: () => void;
  updatingId: string | null;
  updatingUserId: string | null;
  onSetPaymentStatus: (bookingId: string, status: 'paid' | 'not_paid') => void;
  onSetStatus: (bookingId: string, status: 'cancelled') => void;
  onDeleteUser: (uid: string) => void;
}) {
  /** Закрываем модалку до запуска действия — индикатор живёт в строке таблицы. */
  const run = (fn: () => void) => { onClose(); fn(); };

  return (
    <>
      <ConfirmDialog
        isOpen={action?.type === 'paid'}
        title="Подтвердить оплату?"
        message="Вы уверены, что хотите отметить эту бронь как оплаченную? Это изменит статус оплаты."
        confirmLabel="Да, оплату получили"
        cancelLabel="Отмена"
        loading={action?.type === 'paid' && updatingId === action.bookingId}
        onCancel={onClose}
        onConfirm={() => {
          if (action?.type !== 'paid') return;
          const id = action.bookingId;
          run(() => onSetPaymentStatus(id, 'paid'));
        }}
      />

      <ConfirmDialog
        isOpen={action?.type === 'unpaid'}
        title="Снять оплату?"
        message="Вы уверены, что хотите снова отметить эту бронь как неоплаченную? Это действие может сделать билет недействительным."
        confirmLabel="Да, снять оплату"
        cancelLabel="Отмена"
        loading={action?.type === 'unpaid' && updatingId === action.bookingId}
        onCancel={onClose}
        onConfirm={() => {
          if (action?.type !== 'unpaid') return;
          const id = action.bookingId;
          run(() => onSetPaymentStatus(id, 'not_paid'));
        }}
      />

      <ConfirmDialog
        isOpen={action?.type === 'cancel'}
        title="Отменить бронь?"
        message="Вы уверены, что хотите отменить эту бронь? Билет станет недействительным."
        confirmLabel="Да, отменить бронь"
        cancelLabel="Назад"
        loading={action?.type === 'cancel' && updatingId === action.bookingId}
        onCancel={onClose}
        onConfirm={() => {
          if (action?.type !== 'cancel') return;
          const id = action.bookingId;
          run(() => onSetStatus(id, 'cancelled'));
        }}
      />

      <ConfirmDialog
        isOpen={action?.type === 'deleteUser'}
        title="Удалить пользователя полностью?"
        message={
          action?.type === 'deleteUser'
            ? `Пользователь «${action.displayName}» будет удалён из Firebase Auth, коллекции users и все его бронирования будут удалены. Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Да, удалить полностью"
        cancelLabel="Отмена"
        loading={action?.type === 'deleteUser' && updatingUserId === action.uid}
        onCancel={onClose}
        onConfirm={() => {
          if (action?.type !== 'deleteUser') return;
          const uid = action.uid;
          run(() => onDeleteUser(uid));
        }}
      />
    </>
  );
}
