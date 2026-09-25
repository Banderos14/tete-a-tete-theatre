// Деньги: Stripe считает в центах, брони и интерфейс — в евро.

/** Центы → евро (1250 → 12.5). */
export function centsToEuros(cents: number): number {
  return cents / 100;
}
