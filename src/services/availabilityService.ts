// Остаток мест по спектаклю.
//
// Модуль намеренно НЕ импортирует firebase/config: ShowModal подключён к лендингу
// статически, и любой импорт Firebase отсюда затащил бы SDK в главный чанк. Тогда
// ошибка инициализации Firebase падала бы ещё до монтирования React — и никакая
// граница ошибок её бы не поймала (именно так лендинг и превращался в белый экран).
//
// Считать занятость на клиенте невозможно: правила Firestore не разрешают читать
// чужие брони. Число приходит с сервера, null означает «остаток неизвестен» —
// тогда индикатор просто не показывается.
export async function fetchShowAvailability(showId: string): Promise<number | null> {
  const all = await fetchAllAvailability();
  const remaining = all?.[showId];
  return typeof remaining === 'number' ? remaining : null;
}

/**
 * Остаток мест по всем сеансам сразу (id сеанса → свободно мест) — для выбора
 * сеанса постановки с несколькими показами: у каждого сеанса свой остаток.
 * null — остаток неизвестен.
 */
export async function fetchAllAvailability(): Promise<Record<string, number> | null> {
  try {
    const resp = await fetch('/api/show-availability', { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as { shows?: Record<string, { remaining?: unknown }> };
    if (!data.shows || typeof data.shows !== 'object') return null;
    const out: Record<string, number> = {};
    for (const [id, entry] of Object.entries(data.shows)) {
      if (typeof entry?.remaining === 'number') out[id] = entry.remaining;
    }
    return out;
  } catch {
    // Локальный `npm run dev` не поднимает /api/* — это штатная ситуация.
    return null;
  }
}
