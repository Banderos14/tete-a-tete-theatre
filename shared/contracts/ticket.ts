// Контракт GET /api/public-ticket — публичная страница билета.
//
// Изоморфный модуль: ответ читает браузер (/#/ticket?code=…), собирает сервер.
// Код брони здесь работает как предъявительский идентификатор: у кого ссылка,
// тот видит билет. Поэтому в ответе только то, что и так напечатано на билете, —
// спектакль, дата, места, состояние оплаты. Имени, e-mail, телефона, id брони
// и пользователя здесь нет и быть не должно.

/**
 * Что можно сделать с билетом на входе.
 *   active          — действующий билет, QR показывается;
 *   payment_pending — онлайн-оплата не завершена, билета ещё нет;
 *   attended        — проход уже отмечен;
 *   cancelled       — бронь отменена или истёк срок оплаты;
 *   refunded        — бронь отменена, деньги возвращаются или возвращены.
 */
export type PublicTicketState = 'active' | 'payment_pending' | 'attended' | 'cancelled' | 'refunded';

/** Как оплачен действующий билет. */
export type PublicTicketPayment = 'paid' | 'on_site' | 'transfer';

export interface PublicTicket {
  code:      string;
  state:     PublicTicketState;
  showId:    string;
  /** Название и дата уже локализованы сервером — страница язык выбирает сама. */
  title:     { RU: string; FR: string };
  date:      { RU: string; FR: string };
  time:      string;
  seats:     number;
  lines:     { type: string; quantity: number }[];
  /** Только у действующего билета. */
  payment?:  PublicTicketPayment;
  /** Сумма к оплате на входе — только у неоплаченного действующего билета. */
  amountDue?: number;
}

export interface PublicTicketResponse {
  ok:     true;
  ticket: PublicTicket;
}
