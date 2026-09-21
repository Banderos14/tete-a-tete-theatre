// Тексты группового прохода: склонения и подпись основной кнопки.
// Без React — чтобы карточка и лист подтверждения говорили одними словами.

import type { CheckinGroup } from '../../services/adminBookingService';

/** 1 билет, 2 билета, 5 билетов, 11 билетов, 21 билет. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ticketsLabel = (n: number) => `${n} ${plural(n, 'билет', 'билета', 'билетов')}`;

/** Текст основной кнопки — говорит, сколько денег принять и сколько человек пропустить. */
export function groupActionLabel(g: CheckinGroup): string {
  const n = g.remainingTickets;
  if (g.cashDue > 0) return `Принять ${g.cashDue} € и отметить ${ticketsLabel(n)}`;
  if (g.attendedTickets > 0) {
    return `Отметить ${plural(n, 'оставшийся', 'оставшиеся', 'оставшиеся')} ${ticketsLabel(n)}`;
  }
  return `Отметить посещение — ${ticketsLabel(n)}`;
}
