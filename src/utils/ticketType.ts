import type { TicketTypeId } from '../../shared/catalog/shows';

const LABELS: Record<TicketTypeId, { RU: string; FR: string }> = {
  standard: { RU: 'Обычный', FR: 'Plein tarif' },
  student:  { RU: 'Ученик / студент', FR: 'Scolaire / étudiant' },
  child:    { RU: 'Ребёнок', FR: 'Enfant' },
  adult:    { RU: 'Взрослый', FR: 'Adulte' },
  family:   { RU: 'Ребёнок + 2 родителя', FR: 'Enfant + 2 parents' },
};

export function ticketTypeLabel(ticketType: TicketTypeId, lang: 'RU' | 'FR'): string {
  return LABELS[ticketType]?.[lang] ?? ticketType;
}
