// Данные анонса спектакля. Письма о бронях и билетах собирает сервер
// (shared/email, server/email/ticketEmail.service.ts) — во фронтенде их больше нет.

export interface NewShowEmailData {
  userEmail:   string;
  userName:    string;
  showTitle:   string;
  showDate:    string;
  showTime:    string;
  price?:      string;
  description?: string;
  showUrl:     string;
  lang:        'RU' | 'FR';
}
