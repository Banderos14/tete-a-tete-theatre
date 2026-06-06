// Перед продакшеном заменить IBAN и BIC на реальные реквизиты театра.
// Все компоненты и email-шаблоны читают реквизиты только отсюда —
// достаточно изменить этот файл один раз.
export const PAYMENT_CONFIG = {
  receiverName:  'Théâtre Tête-à-Tête',
  iban:          'FR76 XXXX XXXX XXXX XXXX XXXX XXX',
  bic:           'XXXXFRXX',
  paymentEmail:  'teteatete.theatre.nice@gmail.com',
  paymentPhone:  '+33 6 13 67 55 95',
  address:       '24 Rue Rossini, 06000 Nice',
} as const;

// card_transfer готов архитектурно, но скрыт из UI до получения точных реквизитов карты.
export type ManualPaymentMethod = 'bank_transfer' | 'on_site';
