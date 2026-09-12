// Результат проверки билета: использован / действителен / оплата на месте /
// недействителен. Четыре варианта делят один каркас: раньше карточка была
// скопирована четырежды, и правка шапки или строки требовала четырёх одинаковых
// правок. Состав строк у каждого варианта сохранён прежний.

import type { ReactNode } from 'react';
import type { CheckinBooking } from '../../services/checkinService';
import styles from './TicketCheckPage.module.scss';

type Variant = 'used' | 'valid' | 'invalid';

const VARIANT_CARD: Record<Variant, string> = {
  used:    styles.cardUsed,
  valid:   styles.cardValid,
  invalid: styles.cardInvalid,
};

const VARIANT_STATUS: Record<Variant, string> = {
  used:    styles.cardStatusUsed,
  valid:   styles.cardStatusValid,
  invalid: styles.cardStatusInvalid,
};

function CardRow({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={`${styles.cardValue} ${valueClass ?? ''}`.trim()}>{value}</span>
    </div>
  );
}

function ResultCard({ variant, icon, status, rows, reason, actions }: {
  variant: Variant;
  icon: string;
  status: string;
  rows?: ReactNode;
  /** Текст вместо таблицы строк — когда брони нет и показывать нечего. */
  reason?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className={styles.cardWrap}>
      <div className={`${styles.card} ${VARIANT_CARD[variant]}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>{icon}</span>
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
  if (n === 1) return 'билет';
  if (n >= 2 && n <= 4) return 'билета';
  return 'билетов';
}

function invalidReason(b: CheckinBooking, isStaleShow: boolean, isBankTransferUnpaid: boolean): string {
  if (isBankTransferUnpaid)                     return 'Перевод ещё не получен';
  if (isStaleShow)                              return `Билет на прошедший спектакль (${b.showDate})`;
  if (b.status === 'cancelled')                 return 'Бронь отменена';
  if (b.paymentStatus === 'expired')            return 'Срок оплаты истёк — бронь аннулирована';
  if (b.paymentStatus === 'awaiting_transfer')  return 'Перевод ещё не получен';
  if (b.paymentStatus !== 'paid')               return 'Билет не оплачен';
  return 'Недействителен';
}

/** Ошибка распознавания: брони нет, показываем только причину. */
export function ScanErrorCard({ message, onReset, resetLabel }: {
  message: string;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <ResultCard
      variant="invalid"
      icon="❌"
      status="БИЛЕТ НЕ ДЕЙСТВИТЕЛЕН"
      reason={message}
      actions={<button className={styles.secondaryBtn} onClick={onReset}>{resetLabel}</button>}
    />
  );
}

export function TicketResultCard({ booking: b, onReset, resetLabel, onCashReceived, onMarkAttended }: {
  booking: CheckinBooking;
  onReset: () => void;
  resetLabel: string;
  onCashReceived: () => void;
  onMarkAttended: () => void;
}) {
  // Билет прошедшего спектакля не должен считаться действительным только потому,
  // что код существует в базе. Актуальность даты определяет сервер.
  const isStaleShow          = b.showRelevance === 'too_late';
  const isEarlyShow          = b.showRelevance === 'too_early';
  const isOnSiteUnpaid       = !isStaleShow && b.paymentMethod === 'on_site' && b.paymentStatus === 'not_paid';
  const isBankTransferUnpaid = b.paymentMethod === 'bank_transfer' && b.paymentStatus !== 'paid';
  const isPaidValid          = !isStaleShow && b.paymentStatus === 'paid' && b.status === 'confirmed';
  const isAttended           = b.status === 'attended';

  const resetBtn = <button className={styles.secondaryBtn} onClick={onReset}>{resetLabel}</button>;

  // По одному QR проходит вся бронь целиком, поэтому количество — это
  // количество ЛЮДЕЙ у двери. При двух и более билетах строка набирается
  // крупно: сотрудник должен видеть её, не вчитываясь.
  const countRow = (
    <CardRow
      label="Количество"
      value={`${b.ticketsCount} ${ticketsWord(b.ticketsCount)}`}
      valueClass={b.ticketsCount > 1
        ? `${styles.cardValueCount} ${styles.cardValueCountMany}`
        : styles.cardValueCount}
    />
  );

  // Билет выписан не на сегодняшний вечер. Проход не запрещаем — решает
  // сотрудник, — но расхождение обязано быть видно.
  const dateWarning = (isEarlyShow || b.showDateDiffers) ? (
    <CardRow
      label="Внимание"
      value={b.showDateDiffers
        ? `Бронь на другую дату спектакля — ${b.showDate}`
        : `Билет на другую дату — ${b.showDate}`}
      valueClass={styles.cardValueReason}
    />
  ) : null;

  // «Недействителен» дату не показывает — она уже звучит в причине отказа.
  const whoAndWhat = (
    <>
      <CardRow label="Зритель"   value={b.userName} />
      <CardRow label="Спектакль" value={b.showTitle} />
    </>
  );
  const ticketCodeRow = <CardRow label="Код билета" value={b.ticketCode} valueClass={styles.mono} />;
  const identityRows = (
    <>
      {whoAndWhat}
      <CardRow label="Дата" value={b.showDate} />
      {ticketCodeRow}
    </>
  );

  if (isAttended) {
    return (
      <ResultCard
        variant="used"
        icon="⚠️"
        status="БИЛЕТ УЖЕ ИСПОЛЬЗОВАН"
        rows={<>{identityRows}{countRow}</>}
        actions={resetBtn}
      />
    );
  }

  if (isOnSiteUnpaid) {
    return (
      <ResultCard
        variant="valid"
        icon="✅"
        status="БИЛЕТ ДЕЙСТВИТЕЛЕН"
        rows={
          <>
            {identityRows}
            {countRow}
            {b.totalAmount > 0 && (
              <CardRow label="Сумма" value={<>{b.totalAmount}&nbsp;€</>} valueClass={styles.cardValueAmount} />
            )}
            <CardRow label="Оплата" value="НЕ ОПЛАЧЕНО — ОПЛАТА НА МЕСТЕ" valueClass={styles.cardValueUnpaid} />
            {dateWarning}
          </>
        }
        actions={
          <>
            <button className={styles.cashBtn} onClick={onCashReceived}>Оплачено</button>
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
        icon="✅"
        status="БИЛЕТ ДЕЙСТВИТЕЛЕН"
        rows={
          <>
            {identityRows}
            {countRow}
            <CardRow label="Оплата" value="Оплачено" />
            {dateWarning}
          </>
        }
        actions={
          <>
            <button className={styles.markBtn} onClick={onMarkAttended}>Отметить посещение</button>
            {resetBtn}
          </>
        }
      />
    );
  }

  return (
    <ResultCard
      variant="invalid"
      icon="❌"
      status="БИЛЕТ НЕ ДЕЙСТВИТЕЛЕН"
      rows={
        <>
          {whoAndWhat}
          {ticketCodeRow}
          <CardRow
            label="Причина"
            value={invalidReason(b, isStaleShow, isBankTransferUnpaid)}
            valueClass={styles.cardValueReason}
          />
        </>
      }
      actions={resetBtn}
    />
  );
}
