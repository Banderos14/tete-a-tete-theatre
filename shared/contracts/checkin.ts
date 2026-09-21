// Контракты API проверки билетов и админских действий с бронью.
//
// Изоморфный модуль: используется и сервером, и страницей проверки/админкой.

/**
 * Действия POST /api/admin-booking (роль admin).
 *
 * По коду билета (сканер, поиск, таблица):
 *   inspect        — показать бронь, ничего не меняет;
 *   mark_attended  — проход по оплаченному билету;
 *   mark_paid      — оплата получена (перевод или касса), без прохода;
 *   group_checkin  — принять оплату (если нужна) и отметить проход всех
 *                    активных броней аккаунта на этот спектакль одним действием.
 *                    Для одиночной брони «оплата на месте» это и есть
 *                    «Принять XX € и пропустить».
 * По id брони (таблица админки):
 *   mark_unpaid, cancel, resend_ticket, delete.
 *
 * Клиент присылает только идентификатор и действие. Суммы, статусы и спектакль
 * брони сервер читает сам; showId — это спектакль, на котором стоит сотрудник,
 * и сервер проверяет, что билет выписан именно на него.
 */
export type CheckinAction = 'inspect' | 'mark_attended' | 'mark_paid' | 'group_checkin';
export type BookingAdminAction = 'mark_unpaid' | 'cancel' | 'resend_ticket' | 'delete';
export type AdminBookingAction = CheckinAction | BookingAdminAction;

/** Снимок брони, который сервер отдаёт сканеру. */
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
  /** Сумма из брони (скидка уже учтена) — единственный источник «к оплате». */
  totalAmount:   number;
  status:        string;
  paymentStatus: string;
  paymentMethod: string;
  /** Название типа билета по каталогу («Ученик / студент»); пусто, если тип неизвестен. */
  ticketTypeLabel: string;
  /**
   * Билет выписан на другой спектакль, чем тот, на котором стоит сотрудник
   * (другой showId или другой вечер того же спектакля). По такому билету
   * проход не отмечается. false, если спектакль в запросе не указан.
   */
  wrongShow:     boolean;
  /**
   * Когда зритель прошёл в зал (мс UTC); null — ещё не проходил. Повторный
   * скан показывает сотруднику время первого прохода, а не просто «использован».
   */
  attendedAtMs:  number | null;
}

export type CheckinRefusalReason =
  | 'not_found' | 'bad_code' | 'already_attended' | 'cancelled' | 'not_paid' | 'already_paid'
  // Билет на другой спектакль (или другой вечер того же спектакля).
  | 'wrong_show'
  // Срок оплаты перевода истёк — бронь аннулирована.
  | 'expired'
  // Групповой проход: бронь нельзя безопасно связать с другими (нет userId
  // или сеанса) — остаётся обычный проход по одному QR.
  | 'no_group'
  // В группе есть бронь в состоянии, которое нельзя принять на входе.
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
  /** Получить на входе: не оплачено и ещё не прошли. */
  cashDue:          number;
  /** Брони, которые групповой проход отметит. */
  remainingBookings: number;
  /** Непрошедшие брони, по которым нельзя пройти прямо сейчас. */
  blockedBookingIds: string[];
  /** Можно ли выполнить group_checkin прямо сейчас. */
  canCheckIn:       boolean;
}
