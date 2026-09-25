// Телефон для ПОКАЗА человеку: «+33 7 49 66 19 40», «+380 67 123 4567».
//
// В базе номер хранится как есть (E.164 без пробелов, см. normalizePhone) —
// здесь он только красиво показывается. Границу кода страны и группировку
// знает libphonenumber-js (метаданные /min): коды бывают из 1–3 цифр, и у
// каждой страны своя разбивка, поэтому самодельный regex тут не годится.
//
// Номер, который библиотека не может надёжно разобрать (старые записи без
// «+», обрывки), показывается как есть — не искажаем то, что не понимаем.
// Модуль подключают только админка и сканер (ленивые чанки).

import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function formatPhoneForDisplay(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  // Без кода страны номер неоднозначен — не угадываем страну.
  if (!value.startsWith('+')) return value;
  const compact = '+' + value.slice(1).replace(/[\s().-]/g, '');
  if (!/^\+\d{6,15}$/.test(compact)) return value;
  const parsed = parsePhoneNumberFromString(compact);
  return parsed && parsed.isPossible() ? parsed.formatInternational() : value;
}
