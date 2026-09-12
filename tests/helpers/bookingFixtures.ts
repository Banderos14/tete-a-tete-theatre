// Фабрики состояний брони для тестов жизненного цикла билета.
//
// Состояния перечислены один раз и здесь: тест про отмену, тест про
// вместимость и тест про проход должны говорить об ОДНОЙ и той же
// «оплаченной брони», иначе они начинают расходиться в мелочах и перестают
// быть сравнимыми между собой.

export interface BookingFixture {
  status:              string;
  paymentStatus:       string;
  paymentMethod:       string;
  ticketsCount:        number;
  seatsCount?:         number;
  paymentExpiresAtMs?: number | null;
}

const BASE: BookingFixture = {
  status:        'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'on_site',
  ticketsCount:  1,
};

type Patch = Partial<BookingFixture>;

/** Оплаченная подтверждённая бронь — единственное состояние, пускающее в зал. */
export const paidConfirmed = (patch: Patch = {}): BookingFixture => ({ ...BASE, ...patch });

/** Оплата на месте: QR у зрителя есть, деньги ещё не получены. */
export const unpaidOnSite = (patch: Patch = {}): BookingFixture =>
  ({ ...BASE, status: 'pending', paymentStatus: 'not_paid', paymentMethod: 'on_site', ...patch });

/** Банковский перевод, срок оплаты ещё идёт. */
export const awaitingTransfer = (patch: Patch = {}): BookingFixture => ({
  ...BASE,
  status:             'pending',
  paymentStatus:      'awaiting_transfer',
  paymentMethod:      'bank_transfer',
  paymentExpiresAtMs: Date.now() + 60 * 60 * 1000,
  ...patch,
});

/** Перевод не пришёл за 24 часа — бронь аннулирована и место освобождено. */
export const expiredTransfer = (patch: Patch = {}): BookingFixture => ({
  ...BASE,
  status:             'cancelled',
  paymentStatus:      'expired',
  paymentMethod:      'bank_transfer',
  paymentExpiresAtMs: Date.now() - 60 * 60 * 1000,
  ...patch,
});

/** Отменённая бронь. */
export const cancelled = (patch: Patch = {}): BookingFixture =>
  ({ ...BASE, status: 'cancelled', paymentStatus: 'not_paid', ...patch });

/** Зритель уже прошёл в зал. */
export const attended = (patch: Patch = {}): BookingFixture =>
  ({ ...BASE, status: 'attended', ...patch });

/** Групповая бронь: по одному QR проходит несколько человек. */
export const multiTicket = (count: number, patch: Patch = {}): BookingFixture =>
  ({ ...BASE, ticketsCount: count, ...patch });
