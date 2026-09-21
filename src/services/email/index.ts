// Почтовый слой frontend'а — только черновик анонса для рассылки.
//
// Письма о брони, оплате, отмене и повторная отправка билета собираются и
// отправляются СЕРВЕРОМ: раньше их слал браузер после ответа API, и закрытая
// вкладка означала «бронь есть, письма нет».

export type { NewShowEmailData } from './types';
export { escapeEmailHtml } from '../../../shared/email/layout';
export { buildNewShowEmail } from './templates/newShow';
