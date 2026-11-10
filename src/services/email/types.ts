// Данные анонса спектакля. Письма о бронях и билетах собирает сервер
// (shared/email, server/email/ticketEmail.service.ts) — во фронтенде их больше нет.

export interface NewShowEmailData {
  userEmail:   string;
  userName:    string;
  showTitle:   string;
  showDate:    string;
  showTime:    string;
  /** Все предстоящие сеансы постановки; больше одного — в письме список вместо одной даты. */
  sessions?:   Array<{ showDate: string; showTime: string }>;
  price?:      string;
  description?: string;
  showUrl:     string;
  lang:        'RU' | 'FR';
}
