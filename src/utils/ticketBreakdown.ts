// Состав брони для экранов: «2 × Обычный, 2 × Ученик / студент».
// Правило одно для кабинета, PDF, админки и писем — shared/domain/ticketBasket.ts;
// у старой брони без ticketItems это ticketType × ticketsCount.

import { bookingTicketLines, isMixedBooking } from '../../shared/domain/ticketBasket';
import { ticketBreakdownLabel } from '../../shared/catalog/ticketTypes';

export { bookingTicketLines, isMixedBooking };

export function bookingBreakdown(
  b: Parameters<typeof bookingTicketLines>[0], lang: 'RU' | 'FR', separator = ', ',
): string {
  return ticketBreakdownLabel(bookingTicketLines(b), lang, separator);
}
