// Названия тарифов на двух языках — общие для кабинета, PDF и писем.

import {
  FUNTIK_TICKETS, SLADOSTI_TICKETS, type TicketTypeId, type TicketInfo, type TariffGroupId,
} from './shows.js';

/** Название категории пакетов — заголовок группы в форме и префикс подписи брони. */
export const TARIFF_GROUP_LABELS: Record<TariffGroupId, { RU: string; FR: string; hintRU: string; hintFR: string }> = {
  association: {
    RU: 'Для семей ассоциации', FR: "Pour les familles de l'association",
    hintRU: 'Специальная цена для семей ассоциации', hintFR: "Tarif spécial pour les familles de l'association",
  },
  standard: {
    RU: 'Стандартные тарифы', FR: 'Tarifs standard',
    hintRU: 'Для всех зрителей', hintFR: 'Pour tous les spectateurs',
  },
};

// Подпись пакета в письме, PDF, кабинете, админке и Stripe: у пакета с
// категорией — с её названием, чтобы «Взрослый + ребёнок» ассоциации (80 €)
// нельзя было спутать со стандартным (100 €).
const GROUP_PREFIX: Record<TariffGroupId, { RU: string; FR: string }> = {
  association: { RU: 'Семьи ассоциации', FR: "Familles de l'association" },
  standard:    { RU: 'Стандартный тариф', FR: 'Tarif standard' },
};
function packageLabels<K extends string>(table: Record<K, TicketInfo>): Record<K, { RU: string; FR: string }> {
  return Object.fromEntries((Object.entries(table) as Array<[K, TicketInfo]>).map(([id, t]) => {
    const prefix = t.group ? GROUP_PREFIX[t.group] : null;
    return [id, prefix
      ? { RU: `${prefix.RU}: ${t.label}`, FR: `${prefix.FR} : ${t.labelFR}` }
      : { RU: t.label, FR: t.labelFR }];
  })) as Record<K, { RU: string; FR: string }>;
}

const LABELS: Record<TicketTypeId, { RU: string; FR: string }> = {
  standard: { RU: 'Обычный', FR: 'Plein tarif' },
  student:  { RU: 'Ученик / студент', FR: 'Scolaire / étudiant' },
  child:    { RU: 'Ребёнок', FR: 'Enfant' },
  adult:    { RU: 'Взрослый', FR: 'Adulte' },
  family:   { RU: 'Ребёнок + 2 родителя', FR: 'Enfant + 2 parents' },
  // «Дюймовочка»
  constellation: { RU: 'Дети «Созвездия»', FR: 'Enfants de Constellation' },
  regular:       { RU: 'Обычный билет', FR: 'Billet standard' },
  // «Фунтик» и «Новый год в стране сладостей» — пакеты
  ...packageLabels(FUNTIK_TICKETS),
  ...packageLabels(SLADOSTI_TICKETS),
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
