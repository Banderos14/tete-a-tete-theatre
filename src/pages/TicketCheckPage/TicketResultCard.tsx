// Результат проверки одиночного билета.
//
// Варианты: проход только что отмечен / уже использован / оплачен — можно
// пропустить / не оплачено, принять деньги / билет на другой спектакль /
// недействителен (отменён, аннулирован).
// Все делят один каркас: раньше карточка была скопирована четырежды, и правка
// шапки или строки требовала четырёх одинаковых правок.
//
// Главное правило экрана — цвет и заголовок читаются издалека и не врут:
// неоплаченный билет «оплата на месте» раньше был зелёным «ДЕЙСТВИТЕЛЕН», и
// сотрудник в очереди мог пропустить зрителя, не взяв денег.

import type { ReactNode } from 'react';
import {
  IconAlertTriangle, IconCash, IconCircleCheck, IconCircleX, IconTheater, IconUserCheck,
  type Icon,
} from '@tabler/icons-react';
import type { CheckinBooking } from '../../services/adminBookingService';
import { formatAttendedAt } from './checkinShows';
import styles from './TicketCheckPage.module.scss';

type Variant = 'done' | 'used' | 'valid' | 'cash' | 'wrongShow' | 'invalid';

const VARIANT_CARD: Record<Variant, string> = {
  done:    styles.cardValid,
  used:    styles.cardUsed,
  valid:   styles.cardValid,
  cash:    styles.cardUsed,
  wrongShow: styles.cardInvalid,
  invalid: styles.cardInvalid,
};

const VARIANT_STATUS: Record<Variant, string> = {
  done:    styles.cardStatusValid,
  used:    styles.cardStatusUsed,
  valid:   styles.cardStatusValid,
  cash:    styles.cardStatusUsed,
  wrongShow: styles.cardStatusInvalid,
  invalid: styles.cardStatusInvalid,
};

const VARIANT_ICON: Record<Variant, Icon> = {
  done:    IconUserCheck,
  used:    IconAlertTriangle,
  valid:   IconCircleCheck,
  cash:    IconCash,
  wrongShow: IconTheater,
  invalid: IconCircleX,
};

function CardRow({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={`${styles.cardValue} ${valueClass ?? ''}`.trim()}>{value}</span>
    </div>
  );
}

function ResultCard({ variant, status, rows, reason, actions }: {
  variant: Variant;
  status: string;
  rows?: ReactNode;
  /** Текст вместо таблицы строк — когда брони нет и показывать нечего. */
  reason?: ReactNode;
  actions: ReactNode;
}) {
  const StatusIcon = VARIANT_ICON[variant];
  return (
    <div className={styles.cardWrap}>
      <div className={`${styles.card} ${VARIANT_CARD[variant]}`} role="status">
        <div className={styles.cardHeader}>
          <StatusIcon className={`${styles.cardIcon} ${VARIANT_STATUS[variant]}`} size={28} stroke={1.5} aria-hidden="true" />
          <span className={`${styles.cardStatus} ${VARIANT_STATUS[variant]}`}>{status}</span>
        </div>
        {rows   && <div className={styles.cardDetails}>{rows}</div>}
        {reason && <div className={styles.cardReason}>{reason}</div>}
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}

function ticketsWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'билет';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'билета';
  return 'билетов';
}

function invalidReason(b: CheckinBooking): string {
  if (b.paymentStatus === 'expired')            return 'Срок оплаты перевода истёк — бронь аннулирована';
  if (b.status === 'cancelled')                 return 'Бронь отменена';
  return 'Состояние брони не позволяет пропустить — проверьте её в админке';
}

/** Ошибка распознавания: брони нет, показываем только причину. */
export function ScanErrorCard({ message, onReset, resetLabel, onNext }: {
  message: string;
  onReset: () => void;
  resetLabel: string;
  onNext: () => void;
}) {
  return (
    <ResultCard
      variant="invalid"
      status="БИЛЕТ НЕ ПРИНЯТ"
      reason={message}
      actions={
        <>
          <button className={styles.startBtn} onClick={onNext}>Сканировать следующий</button>
          <button className={styles.secondaryBtn} onClick={onReset}>{resetLabel}</button>
        </>
      }
    />
  );
}

export function TicketResultCard({
  booking: b, justCheckedIn, onReset, resetLabel, onNext, onCashReceived, onPayAndCheckIn, onMarkAttended,
}: {
  booking: CheckinBooking;
  /** Проход отмечен только что, с этого экрана. */
  justCheckedIn: boolean;
  onReset: () => void;
  resetLabel: string;
  /** Сразу открыть камеру для следующего зрителя. */
  onNext: () => void;
  onCashReceived: () => void;
  onPayAndCheckIn: () => void;
  onMarkAttended: () => void;
}) {
  const isDead        = b.status === 'cancelled' || b.paymentStatus === 'expired';
  const isAttended    = b.status === 'attended';
  const isPaidValid   = !isDead && !isAttended && b.paymentStatus === 'paid';
  // Не оплачено: и «оплата на месте», и перевод, который не дошёл, — деньги
  // принимаются у входа. Сумма — из брони, как её посчитал сервер.
  const isUnpaid      = !isDead && !isAttended
    && (b.paymentStatus === 'not_paid' || b.paymentStatus === 'awaiting_transfer');
  const isTransfer    = b.paymentStatus === 'awaiting_transfer';
  const attendedAt    = formatAttendedAt(b.attendedAtMs);

  const nextBtn  = <button className={styles.startBtn} onClick={onNext}>Сканировать следующий</button>;
  const resetBtn = <button className={styles.secondaryBtn} onClick={onReset}>{resetLabel}</button>;

  // По одному QR проходит вся бронь целиком, поэтому здесь показываем
  // фактическое число МЕСТ (семейный пакет занимает три). При двух и более строка набирается
  // крупно: сотрудник должен видеть её, не вчитываясь.
  const countRow = (
    <CardRow
      label="Количество"
      value={`${b.seatsCount} ${ticketsWord(b.seatsCount)}`}
      valueClass={b.seatsCount > 1
        ? `${styles.cardValueCount} ${styles.cardValueCountMany}`
        : styles.cardValueCount}
    />
  );

  const whoAndWhat = (
    <>
      <CardRow label="Зритель"   value={b.userName} />
      <CardRow label="Спектакль" value={b.showTitle} />
    </>
  );
  const ticketCodeRow = <CardRow label="Код брони" value={b.ticketCode} valueClass={styles.mono} />;
  const identityRows = (
    <>
      {whoAndWhat}
      <CardRow label="Сеанс" value={`${b.showDate} · ${b.showTime}`} />
      {b.ticketTypeLabel && <CardRow label="Тариф" value={b.ticketTypeLabel} />}
      {ticketCodeRow}
    </>
  );
  const paidRow = <CardRow label="Оплата" value="ОПЛАЧЕНО" valueClass={styles.cardValuePaid} />;

  if (isAttended) {
    return (
      <ResultCard
        variant={justCheckedIn ? 'done' : 'used'}
        status={justCheckedIn ? 'ПРОХОД ОТМЕЧЕН' : 'БИЛЕТ УЖЕ ИСПОЛЬЗОВАН'}
        rows={
          <>
            {!justCheckedIn && attendedAt && (
              <CardRow label="Прошёл" value={attendedAt} valueClass={styles.cardValueReason} />
            )}
            {identityRows}
            {countRow}
          </>
        }
        actions={<>{nextBtn}{resetBtn}</>}
      />
    );
  }

  // Отменённая или аннулированная бронь — никогда не зелёная.
  if (isDead) {
    return (
      <ResultCard
        variant="invalid"
        status={b.paymentStatus === 'expired' ? 'БРОНЬ АННУЛИРОВАНА' : 'БРОНЬ ОТМЕНЕНА'}
        rows={
          <>
            {whoAndWhat}
            {ticketCodeRow}
            <CardRow label="Причина" value={invalidReason(b)} valueClass={styles.cardValueReason} />
          </>
        }
        actions={<>{nextBtn}{resetBtn}</>}
      />
    );
  }

  // Билет другого спектакля: показываем, на какой он, и ничего не отмечаем.
  if (b.wrongShow && !isAttended) {
    return (
      <ResultCard
        variant="wrongShow"
        status="БИЛЕТ НА ДРУГОЙ СПЕКТАКЛЬ"
        rows={
          <>
            <CardRow label="Спектакль" value={b.showTitle} valueClass={styles.cardValueReason} />
            <CardRow label="Дата" value={b.showDate} valueClass={styles.cardValueReason} />
            <CardRow label="Время" value={b.showTime} valueClass={styles.cardValueReason} />
            <CardRow label="Зритель" value={b.userName} />
            {ticketCodeRow}
            {countRow}
          </>
        }
        actions={<>{nextBtn}{resetBtn}</>}
      />
    );
  }

  if (isUnpaid) {
    return (
      <ResultCard
        variant="cash"
        status={b.totalAmount > 0 ? `НЕ ОПЛАЧЕНО · К ОПЛАТЕ ${b.totalAmount} €` : 'НЕ ОПЛАЧЕНО'}
        rows={
          <>
            {identityRows}
            {countRow}
            {b.totalAmount > 0 && (
              <CardRow label="К оплате" value={<>{b.totalAmount}&nbsp;€</>} valueClass={styles.cardValueAmount} />
            )}
            <CardRow
              label="Оплата"
              value={isTransfer
                ? 'ПЕРЕВОД НЕ ПОЛУЧЕН — спросите зрителя, прежде чем брать деньги'
                : 'НЕ ОПЛАЧЕНО — ОПЛАТА НА МЕСТЕ'}
              valueClass={styles.cardValueUnpaid}
            />
          </>
        }
        actions={
          <>
            <button className={styles.cashBtn} onClick={onPayAndCheckIn}>
              {b.totalAmount > 0 ? `Принять ${b.totalAmount} € и пропустить` : 'Подтвердить и пропустить'}
            </button>
            <button className={styles.secondaryBtn} onClick={onCashReceived}>Только принять оплату</button>
            {resetBtn}
          </>
        }
      />
    );
  }

  if (isPaidValid) {
    return (
      <ResultCard
        variant="valid"
        status="ОПЛАЧЕНО · МОЖНО ПРОПУСТИТЬ"
        rows={
          <>
            {identityRows}
            {countRow}
            {paidRow}
          </>
        }
        actions={
          <>
            <button className={styles.markBtn} onClick={onMarkAttended}>
              Отметить проход — {b.seatsCount} {ticketsWord(b.seatsCount)}
            </button>
            {resetBtn}
          </>
        }
      />
    );
  }

  return (
    <ResultCard
      variant="invalid"
      status="БИЛЕТ НЕ ПРИНЯТ"
      rows={
        <>
          {whoAndWhat}
          {ticketCodeRow}
          <CardRow label="Причина" value={invalidReason(b)} valueClass={styles.cardValueReason} />
        </>
      }
      actions={<>{nextBtn}{resetBtn}</>}
    />
  );
}
