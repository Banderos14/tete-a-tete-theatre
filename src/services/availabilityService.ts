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
  try {
    const resp = await fetch('/api/show-availability', { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as { shows?: Record<string, { remaining?: number }> };
    const remaining = data.shows?.[showId]?.remaining;
    return typeof remaining === 'number' ? remaining : null;
  } catch {
    // Локальный `npm run dev` не поднимает /api/* — это штатная ситуация.
    return null;
  }
}
