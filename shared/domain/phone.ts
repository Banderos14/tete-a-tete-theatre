// Телефон зрителя: разбор ввода, хранение и показ. Одна реализация для форм
// (бронь, профиль) и сервера.
//
// Человек вводит номер как привык: «07 49 66 19 40», «0749661940»,
// «+33 7 49 66 19 40», «0033 7 49 66 19 40», «+380 67 123 45 67». Всё это
// разбирает libphonenumber-js (метаданные /min): коды стран бывают из 1–3 цифр,
// у каждой страны своя длина и группировка — набор regex тут не годится.
//
// Правила:
// - номер с «+» или «00» — международный, страна берётся из кода;
// - номер с ведущим «0» без кода страны — французский (театр в Ницце);
// - прочие номера без кода страны не угадываем: «380671234567» может быть чем угодно;
// - хранится E.164 без пробелов («+33749661940»), показывается с пробелами
//   («+33 7 49 66 19 40»);
// - номер, который разобрать нельзя (старые записи), не переписывается и не
//   стирается — остаётся как был.

import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/** Страна по умолчанию для номера без кода страны, начинающегося с 0. */
export const DEFAULT_PHONE_COUNTRY = 'FR';

/** Всё, кроме символов, которые человек может набрать в поле телефона. */
const NOT_PHONE_CHAR = /[^\d+\s().\-/]/;
const NOT_PHONE_CHARS = new RegExp(NOT_PHONE_CHAR.source, 'g');
/** Потолок длины ввода — с запасом на пробелы и скобки (E.164 — до 15 цифр). */
const MAX_TYPED_LENGTH = 32;

export interface ParsedPhone {
  /** Для хранения: «+33749661940». */
  e164: string;
  /** Для показа и поля ввода: «+33 7 49 66 19 40». */
  international: string;
}

/** Строка без оформления: пробелы, скобки, точки и дефисы убраны, «00» → «+». */
function compact(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (plus) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  return digits;
}

/**
 * Разбирает номер. null — пусто, не номер или номер, который нельзя надёжно
 * отнести к стране (нет кода страны и не французский «0…»).
 */
export function parsePhone(raw: string | null | undefined): ParsedPhone | null {
  const value = (raw ?? '').trim();
  if (!value || NOT_PHONE_CHAR.test(value)) return null;
  // «+» допустим только в начале.
  if (value.lastIndexOf('+') > 0) return null;

  const number = compact(value);
  if (number.replace('+', '').length < 6) return null;

  const parsed = number.startsWith('+')
    ? parsePhoneNumberFromString(number)
    : number.startsWith('0')
      ? parsePhoneNumberFromString(number, DEFAULT_PHONE_COUNTRY)
      : undefined;
  if (!parsed || !parsed.isValid()) return null;
  return { e164: parsed.number, international: parsed.formatInternational() };
}

/** Номер корректен и однозначно разобран. */
export function isValidPhone(raw: string | null | undefined): boolean {
  return parsePhone(raw) !== null;
}

/**
 * Значение для хранения: E.164. Нераспознанный номер возвращается как есть
 * (без пробелов по краям), чтобы старые записи не терялись; пустой — ''.
 */
export function normalizePhone(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return parsePhone(value)?.e164 ?? value;
}

/**
 * Значение для поля ввода и показа: международный формат с пробелами.
 * Нераспознанный номер показывается как есть — не искажаем то, что не поняли.
 */
export function formatPhoneInput(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return parsePhone(value)?.international ?? value;
}

/**
 * Очистка во время набора: только цифры, «+», пробелы и обычные разделители,
 * без переформатирования — номер не «прыгает» под пальцами. Красивый вид
 * и проверка — при уходе из поля и при отправке.
 */
export function sanitizePhoneTyping(raw: string): string {
  return raw.replace(NOT_PHONE_CHARS, '').slice(0, MAX_TYPED_LENGTH);
}
