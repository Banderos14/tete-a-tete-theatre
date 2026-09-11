// Контракты API проверки билетов.
//
// Изоморфный модуль: используется и сервером, и страницей проверки.

export type CheckinAction = 'inspect' | 'mark_attended' | 'mark_paid';

/** Актуальность спектакля относительно текущего момента. */
export type ShowRelevance = 'ok' | 'too_early' | 'too_late' | 'unknown';

/** Снимок брони, который сервер отдаёт сканеру. */
export interface CheckinBooking {
  bookingId:     string;
  ticketCode:    string;
  showId:        string;
  showTitle:     string;
  showDate:      string;
  showTime:      string;
  userName:      string;
  /** Нужен, чтобы сканер отправил то же письмо об оплате, что и админка. */
  userEmail:     string;
  lang:          'RU' | 'FR';
  ticketsCount:  number;
  totalAmount:   number;
  status:        string;
  paymentStatus: string;
  paymentMethod: string;
  showRelevance: ShowRelevance;
}

export type CheckinRefusalReason =
  | 'not_found' | 'bad_code' | 'already_attended' | 'cancelled' | 'not_paid' | 'already_paid';
