// Чистая логика формы профиля: без React и без Firebase, поэтому проверяется
// юнит-тестом и переиспользуется и десктопным сабмитом, и мобильной кнопкой.

import { isValidPhone, normalizePhone } from '../../../utils/phone';

export interface ValidationErrors {
  displayName?: string;
  birthday?:    string;
  phone?:       string;
}

export interface ProfileFields {
  displayName: string;
  /** 'YYYY-MM-DD' или ''. */
  birthday:    string;
  phone:       string;
  /** Телефон, уже сохранённый в профиле, — старую нераспознаваемую запись не блокируем. */
  storedPhone?: string;
}

export interface ValidationMessages {
  required:        string;
  phoneInvalid:    string;
  birthdayInvalid: string;
}

/** Самый ранний допустимый год рождения — отсекает опечатки вроде 0199. */
export const MIN_BIRTH_YEAR = 1900;

// Обязательно только имя. Дата рождения и телефон — по желанию: ни бронь,
// ни билеты, ни лояльность от них не зависят (телефон для брони спрашивает
// сама форма брони). Заполненное поле при этом должно быть корректным.
export function validate(fields: ProfileFields, messages: ValidationMessages, today = todayIso()): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!fields.displayName.trim()) errors.displayName = messages.required;
  if (fields.birthday && !isValidBirthday(fields.birthday, today)) errors.birthday = messages.birthdayInvalid;

  const phone = fields.phone.trim();
  const untouchedLegacy = !!fields.storedPhone && normalizePhone(phone) === fields.storedPhone.trim();
  if (phone && !isValidPhone(phone) && !untouchedLegacy) errors.phone = messages.phoneInvalid;
  return errors;
}

/**
 * Сегодняшняя дата как 'YYYY-MM-DD' в часовом поясе устройства — это же
 * значение даёт <input type="date">. toISOString() не годится: он в UTC,
 * и вечером в Ницце (UTC+2) уже «завтра» — граница сдвигалась бы на день.
 */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Дата рождения: настоящая календарная дата не позже сегодня и не раньше
 * MIN_BIRTH_YEAR. Сравнение строк 'YYYY-MM-DD' — без Date и часовых поясов.
 */
export function isValidBirthday(value: string, today = todayIso()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < MIN_BIRTH_YEAR || month < 1 || month > 12 || day < 1) return false;
  // 31 февраля и подобное: день не больше длины месяца (Date.UTC — без сдвига пояса).
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
  return value <= today;
}

// Дата хранится строкой 'YYYY-MM-DD' без времени. Показываем её как полночь
// UTC и форматируем тоже в UTC — день не съезжает ни в каком часовом поясе.
export function formatBirthdayDisplay(dateStr: string, lang: 'RU' | 'FR'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

export function getInitials(name: string | null | undefined): string {
  // filter(Boolean) обязателен: у строки из одних пробелов split даёт [''],
  // и прежняя проверка `if (!name)` её пропускала — аватар падал на w[0],
  // унося с собой весь кабинет. Достаточно было начать вводить имя с пробела.
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

/** Коды ошибок Firebase при привязке Facebook → текст для пользователя. */
export function mapFbError(err: unknown, lang: 'RU' | 'FR'): string {
  const code = (err as { code?: string })?.code ?? '';
  const isFR = lang === 'FR';
  const map: Record<string, string> = {
    'auth/popup-closed-by-user':        isFR ? 'Fenêtre fermée'                                                                : 'Окно закрыто',
    'auth/cancelled-popup-request':     isFR ? 'Requête annulée'                                                               : 'Запрос отменён',
    'auth/operation-not-allowed':       isFR ? 'Facebook non activé dans Firebase'                                             : 'Facebook не включён в Firebase Console',
    'auth/provider-already-linked':     isFR ? 'Facebook déjà connecté'                                                        : 'Facebook уже подключён',
    'auth/account-exists-with-different-credential': isFR ? 'Ce compte Facebook est déjà utilisé'                             : 'Этот аккаунт Facebook уже используется',
    'auth/network-request-failed':      isFR ? 'Erreur réseau'                                                                 : 'Ошибка сети',
    'auth/internal-error':              isFR ? 'Facebook temporairement indisponible. Réessayez plus tard.'                    : 'Facebook временно недоступен. Попробуйте позже.',
    'auth/popup-blocked':               isFR ? 'Fenêtre bloquée — autorisez les popups pour ce site'                          : 'Попап заблокирован — разрешите всплывающие окна для этого сайта',
  };
  return map[code] ?? (isFR ? 'Facebook temporairement indisponible. Réessayez plus tard.' : 'Facebook временно недоступен. Попробуйте позже.');
}
