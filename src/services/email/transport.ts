// Транспорт писем: единственное место, где frontend ходит в /api/send-email.
//
// Env-переменная (опционально):
//   VITE_EMAIL_ENDPOINT — по умолчанию "/api/send-email".
//                         Переопределяйте только при смене бэкенда или пути.

// Возвращает true/false по реальному результату запроса.
// Бронирование остаётся best-effort: вызывающий код для писем брони
// игнорирует возвращаемое значение и/или ловит ошибку через .catch(() => {}).
// Рассылка сюда не ходит — у неё свой endpoint /api/newsletter с проверкой квоты.
//
// authToken — Firebase ID token вызывающего; сервер требует его для любого типа.
export async function callEndpoint(
  payload: { type: string; to: string; subject: string; html: string; text: string; ticketCode?: string },
  authToken?: string,
): Promise<boolean> {
  // По умолчанию /api/send-email — работает на Vercel без настройки env во frontend
  const endpoint = (import.meta.env.VITE_EMAIL_ENDPOINT as string | undefined) ?? '/api/send-email';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const resp = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
      console.warn('[emailService] Endpoint returned', resp.status, err);
      return false;
    }
    return true;
  } catch (err) {
    // Сетевая ошибка — бронирование не блокируем, но сообщаем вызывающему коду об отказе
    console.warn('[emailService] Fetch error:', err);
    return false;
  }
}
