// Названия тарифов на двух языках — общие для кабинета, PDF и писем.

import type { TicketTypeId } from './shows.js';

const LABELS: Record<TicketTypeId, { RU: string; FR: string }> = {
  standard: { RU: 'Обычный', FR: 'Plein tarif' },
  student:  { RU: 'Ученик / студент', FR: 'Scolaire / étudiant' },
  child:    { RU: 'Ребёнок', FR: 'Enfant' },
  adult:    { RU: 'Взрослый', FR: 'Adulte' },
  family:   { RU: 'Ребёнок + 2 родителя', FR: 'Enfant + 2 parents' },
};

export function ticketTypeLabel(ticketType: TicketTypeId | string, lang: 'RU' | 'FR'): string {
  return LABELS[ticketType as TicketTypeId]?.[lang] ?? String(ticketType ?? '');
}

/**
 * Состав брони словами: «2 × Обычный, 2 × Ученик / студент». Строки — из
 * bookingTicketLines(): у старой брони это одна строка ticketType × ticketsCount.
 */
export function ticketBreakdownLabel(
  lines: ReadonlyArray<{ type: string; quantity: number }>, lang: 'RU' | 'FR', separator = ', ',
): string {
  return lines.map(l => `${l.quantity} × ${ticketTypeLabel(l.type, lang)}`).join(separator);
}
