// Корешок билета — общий для TicketCard (QR-билет) и BookingCard (бронь без QR).
// Раньше обе карточки держали свои копии этих констант, и цвет корешка мог
// разъехаться между «Моими билетами» и списком броней при правке одной из них.

import type { Booking } from '../types/booking';

/** Декоративный штрихкод корешка: 25 полос одинаковой высоты, ширина 1–4px. */
export const STUB_BARCODE_WIDTHS = [2,1,3,1,1,2,1,4,1,2,1,3,1,1,2,1,3,2,1,4,1,2,1,1,3] as const;

/** Русские трёхбуквенные месяцы из `showDate` → французские сокращения. */
const MONTH_FR_ABBREV: Record<string, string> = {
  'Янв': 'Jan', 'Фев': 'Fév', 'Мар': 'Mar', 'Апр': 'Avr',
  'Май': 'Mai', 'Июн': 'Juin', 'Июл': 'Juil', 'Авг': 'Août',
  'Сен': 'Sep', 'Окт': 'Oct', 'Ноя': 'Nov', 'Дек': 'Déc',
};

/** Разбирает `showDate` вида «17 Май 2026» на день и сокращение месяца. */
export function parseShowDateParts(showDate: string, isFR: boolean): { day: string; monthAbbrev: string } {
  // filter(Boolean): у пустой строки split даёт [''], и прежний `?? '—'`
  // не срабатывал — корешок оставался с пустым днём вместо прочерка.
  const parts = showDate.trim().split(/\s+/).filter(Boolean);
  const day = parts[0] || '—';
  const monthRu = parts[1] ?? '';
  const monthAbbrev = isFR
    ? (MONTH_FR_ABBREV[monthRu] ?? monthRu.toLowerCase())
    : monthRu.toLowerCase();
  return { day, monthAbbrev };
}

export type StubVariant = 'burgundy' | 'amber' | 'grey';

/** Цвет корешка. Приоритет: погашенная бронь > оплачено > ждёт оплаты. */
export function getStubVariant(b: Booking): StubVariant {
  const payStatus = b.paymentStatus ?? 'not_paid';
  if (b.status === 'cancelled' || payStatus === 'expired') return 'grey';
  if (payStatus === 'paid') return 'burgundy';
  if (payStatus === 'awaiting_transfer') return 'amber';
  if (b.paymentMethod === 'on_site' && payStatus === 'not_paid') return 'amber';
  return 'burgundy';
}
