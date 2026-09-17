// Клиент серверного check-in.
//
// Проверка и отметка билета выполняются одной атомарной операцией на сервере
// (/api/checkin-ticket), а не прямой записью в Firestore из браузера: два
// администратора, одновременно отсканировавшие один код, не должны оба
// получить успешный проход.

import type { CheckinGroup as SharedCheckinGroup } from '../../shared/contracts/checkin';

// group_checkin — проход всех активных броней аккаунта на этот сеанс по коду
// любого их QR. Клиент передаёт только код: состав группы и суммы решает сервер.
export type CheckinAction = 'inspect' | 'mark_attended' | 'mark_paid' | 'group_checkin';

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
  userEmail:     string;
  lang:          'RU' | 'FR';
  ticketsCount:  number;
  seatsCount:    number;
  totalAmount:   number;
  status:        string;
  paymentStatus: string;
  paymentMethod: string;
  /** Тип билета по каталогу («Ученик / студент»); пусто, если неизвестен. */
  ticketTypeLabel: string;
  showRelevance: ShowRelevance;
  /**
   * Спектакль с тем же id идёт в другую дату, чем указана в брони.
   * Признак информационный — действительность решает showRelevance.
   */
  showDateDiffers: boolean;
}

/** Активные брони одного аккаунта на один сеанс — суммы посчитаны сервером. */
export type CheckinGroup = SharedCheckinGroup;

export interface CheckinResult {
  ok:      boolean;
  changed: boolean;
  booking: CheckinBooking | null;
  /** Группа броней зрителя на этот сеанс; null — одиночный режим. */
  group:   CheckinGroup | null;
  /** Брони, которые group_checkin перевёл в «оплачено», — по ним уходит письмо. */
  paidBookings: CheckinBooking[];
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
    group:   (data.group as CheckinGroup | undefined) ?? null,
    paidBookings: Array.isArray(data.paidBookings) ? data.paidBookings as CheckinBooking[] : [],
    reason:  typeof data.reason === 'string' ? data.reason : undefined,
    error:   typeof data.error === 'string' ? data.error : undefined,
  };
}
