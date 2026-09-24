// Опечатки в домене почты популярных провайдеров: gnail.com вместо gmail.com.
//
// Такой адрес формально валиден — обычная проверка его пропускает, и письма
// (подтверждение, билет) уходят в никуда. Поэтому при регистрации форма
// показывает подсказку «Возможно, вы имели в виду …@gmail.com?» с кнопкой
// «Исправить». Адрес НИКОГДА не меняется молча: либо зритель принимает
// исправление, либо явно подтверждает, что адрес верный.
//
// Список намеренно консервативный: только точные совпадения с известными
// опечатками крупных провайдеров. Неизвестный домен (в том числе
// корпоративный) не трогается никогда — лучше пропустить опечатку, чем
// заблокировать настоящий адрес.

const TYPOS: Record<string, string> = {
  // gmail.com
  'gnail.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmali.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmaik.com': 'gmail.com',
  'gmaul.com': 'gmail.com', 'gmsil.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gmeil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.cmo': 'gmail.com', 'gmail.ocm': 'gmail.com', 'gmail.vom': 'gmail.com',
  'googlemail.co': 'googlemail.com',
  // hotmail.com / hotmail.fr
  'hotnail.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com', 'hotamil.com': 'hotmail.com', 'hormail.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmail.cm': 'hotmail.com',
  'hotnail.fr': 'hotmail.fr', 'hotmial.fr': 'hotmail.fr', 'hotmal.fr': 'hotmail.fr', 'hotamil.fr': 'hotmail.fr',
  // outlook.com / outlook.fr, live
  'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'oulook.com': 'outlook.com',
  'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'outlok.fr': 'outlook.fr', 'oulook.fr': 'outlook.fr',
  // yahoo
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'yaho.fr': 'yahoo.fr', 'yahooo.fr': 'yahoo.fr',
  // icloud
  'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com',
  // русскоязычные
  'mail.ry': 'mail.ru', 'mial.ru': 'mail.ru', 'yandex.r': 'yandex.ru', 'yandx.ru': 'yandex.ru', 'yadex.ru': 'yandex.ru',
  // французские провайдеры
  'ornage.fr': 'orange.fr', 'oragne.fr': 'orange.fr', 'wanado.fr': 'wanadoo.fr', 'lapost.net': 'laposte.net',
};

const EMAIL_SHAPE = /^([^\s@]+)@([^\s@]+)$/;

/**
 * Исправленный адрес, если домен — известная опечатка; иначе null.
 * Локальная часть не трогается, регистр домена не важен.
 */
export function suggestEmailFix(raw: string): string | null {
  const m = raw.trim().match(EMAIL_SHAPE);
  if (!m) return null;
  const fixed = TYPOS[m[2]!.toLowerCase()];
  return fixed ? `${m[1]}@${fixed}` : null;
}

/** Все известные опечатки — для тестов консервативности списка. */
export const KNOWN_EMAIL_TYPOS: Readonly<Record<string, string>> = TYPOS;

/**
 * Блокирует ли подсказка отправку: опечатка распознана, и зритель не
 * подтвердил именно этот адрес кнопкой «Адрес верный».
 */
export function emailTypoBlocksSubmit(email: string, confirmedAsIs: string | null): boolean {
  const normalized = email.trim().toLowerCase();
  return suggestEmailFix(email) !== null && confirmedAsIs !== normalized;
}
