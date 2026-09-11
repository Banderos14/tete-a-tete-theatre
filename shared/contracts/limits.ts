// Ограничения длины пользовательского ввода.
//
// Объявлены один раз и используются и сервером, и формой: раньше сервер вообще
// не ограничивал comment и phone, а у textarea не было maxLength — в документ
// брони можно было записать сотни килобайт (лимит документа Firestore — 1 МБ).

export const MAX_COMMENT_LEN = 1000;
export const MAX_PHONE_LEN   = 32;
export const MIN_PHONE_LEN   = 5;
export const MAX_CANCEL_COMMENT_LEN = 500;
