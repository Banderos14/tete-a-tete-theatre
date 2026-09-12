// Внутренние типы серверного слоя бронирования.
//
// Это «сырой» вид документа Firestore, а не публичный контракт: поля
// необязательные, потому что в базе лежат и старые брони без новых полей.

export interface RawBooking {
  showId?:                 string;
  showDate?:               string;
  showTime?:               string;
  /** Начало спектакля в мс UTC — развёрнутое значение showStartAt. */
  showStartAtMs?:          number;
  userId?:                 string;
  userName?:               string;
  userEmail?:              string;
  status?:                 string;
  paymentStatus?:          string;
  paymentMethod?:          string;
  ticketsCount?:           number;
  seatsCount?:             number;
  totalAmount?:            number;
  ticketCode?:             string;
  lang?:                   string;
  loyaltyDiscountApplied?: boolean;
  paymentExpiresAtMs?:     number | null;
}

/** Firestore Timestamp в том виде, в каком он нужен серверному коду. */
export interface TimestampLike {
  toMillis?: () => number;
  seconds?:  number;
}

export function timestampToMs(value: unknown): number | undefined {
  const ts = value as TimestampLike | undefined;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number')    return ts.seconds * 1000;
  return undefined;
}
