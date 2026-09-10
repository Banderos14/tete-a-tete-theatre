// Клиент серверного check-in.
//
// Проверка и отметка билета выполняются одной атомарной операцией на сервере
// (/api/checkin-ticket), а не прямой записью в Firestore из браузера: два
// администратора, одновременно отсканировавшие один код, не должны оба
// получить успешный проход.

export type CheckinAction = 'inspect' | 'mark_attended' | 'mark_paid';

// Актуальность спектакля относительно текущего момента.
export type ShowRelevance = 'ok' | 'too_early' | 'too_late' | 'unknown';

export interface CheckinBooking {
  bookingId:     string;
  ticketCode:    string;
  showId:        string;
  showTitle:     string;
  showDate:      string;
  showTime:      string;
  userName:      string;
  ticketsCount:  number;
  totalAmount:   number;
  status:        string;
  paymentStatus: string;
  paymentMethod: string;
  showRelevance: ShowRelevance;
}

export interface CheckinResult {
  ok:      boolean;
  changed: boolean;
  booking: CheckinBooking | null;
  /** Машиночитаемая причина отказа: not_found, already_attended, cancelled, not_paid, ... */
  reason?: string;
  error?:  string;
}

export async function checkinTicket(
  ticketCode: string,
  action: CheckinAction,
  idToken: string,
): Promise<CheckinResult> {
  const resp = await fetch('/api/checkin-ticket', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ ticketCode, action }),
  });

  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;

  return {
    ok:      resp.ok,
    changed: data.changed === true,
    booking: (data.booking as CheckinBooking | undefined) ?? null,
    reason:  typeof data.reason === 'string' ? data.reason : undefined,
    error:   typeof data.error === 'string' ? data.error : undefined,
  };
}
