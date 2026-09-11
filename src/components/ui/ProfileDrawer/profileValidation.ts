// Чистая логика формы профиля: без React и без Firebase, поэтому проверяется
// юнит-тестом и переиспользуется и десктопным сабмитом, и мобильной кнопкой.

import { isCompleteFrenchPhone } from '../../../utils/phone';

export interface ValidationErrors {
  displayName?: string;
  birthday?:    string;
  phone?:       string;
}

export function validate(
  displayName: string,
  birthday: string,
  phone: string,
  required: string,
  phoneInvalid: string,
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!displayName.trim()) errors.displayName = required;
  if (!birthday)           errors.birthday    = required;
  if (!phone.trim())                         errors.phone = required;
  else if (!isCompleteFrenchPhone(phone))    errors.phone = phoneInvalid;
  return errors;
}

export function formatBirthdayDisplay(dateStr: string, lang: 'RU' | 'FR'): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
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
