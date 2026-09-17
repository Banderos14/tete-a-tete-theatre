// Контракты API проверки билетов.
//
// Изоморфный модуль: используется и сервером, и страницей проверки.

export type CheckinAction = 'inspect' | 'mark_attended' | 'mark_paid'
  // Проход всех активных броней того же аккаунта на тот же сеанс — по коду
  // любого из их QR. Состав группы сервер определяет сам.
  | 'group_checkin';

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
  seatsCount:    number;
  totalAmount:   number;
  status:        string;
  paymentStatus: string;
  paymentMethod: string;
  /** Название типа билета по каталогу («Ученик / студент»); пусто, если тип неизвестен. */
  ticketTypeLabel: string;
  showRelevance: ShowRelevance;
  /**
   * Дата брони не совпадает с датой этого спектакля в каталоге: спектакль
   * перенесли, а билет выписан на прежний вечер. Признак информационный —
   * действительность билета решает showRelevance по сеансу самой брони.
   */
  showDateDiffers: boolean;
}

export type CheckinRefusalReason =
  | 'not_found' | 'bad_code' | 'already_attended' | 'cancelled' | 'not_paid' | 'already_paid'
  // Сеанс, на который выписан билет, уже отыгран.
  | 'show_over'
  // Групповой проход: срок оплаты отсканированной брони истёк.
  | 'expired'
  // Групповой проход: бронь нельзя безопасно связать с другими (нет userId
  // или сеанса) — остаётся обычный проход по одному QR.
  | 'no_group'
  // Групповой проход: в группе есть бронь без подтверждённой оплаты,
  // которую нельзя принять на входе (ожидается банковский перевод).
  | 'payment_pending';

/**
 * Активные брони одного аккаунта на один конкретный сеанс.
 *
 * Все суммы и счётчики считает сервер по сохранённым в бронях значениям
 * (totalAmount уже учитывает скидку лояльности) — клиент их только показывает.
 */
export interface CheckinGroup {
  /** Бронь, чей QR отсканирован. */
  scannedBookingId: string;
  bookings:         CheckinBooking[];
  bookingsCount:    number;
  /** Все места группы — сколько человек проходит в зал. */
  totalTickets:     number;
  attendedTickets:  number;
  remainingTickets: number;
  /** Уже оплачено (paymentStatus = paid), включая прошедшие брони. */
  paidAmount:       number;
  /** Получить на входе: оплата на месте, не оплачено, ещё не прошли. */
  cashDue:          number;
  /** Брони, которые групповой проход отметит. */
  remainingBookings: number;
  /** Непрошедшие брони, по которым нельзя пройти: ожидается перевод и т. п. */
  blockedBookingIds: string[];
  /** Сеанс группы — общий для всех её броней. */
  showRelevance:    ShowRelevance;
  /** Можно ли выполнить group_checkin прямо сейчас. */
  canCheckIn:       boolean;
}
