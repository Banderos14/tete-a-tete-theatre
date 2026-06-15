// Форматирование телефонов для BookingModal и ProfileDrawer.
// Французские локальные (07…, 06…) → +33 X XX XX XX XX.
// +33 → то же. Другие +CC → страна + двузначные группы. Голые цифры — без изменений.
export function formatPhone(raw: string): string {
  const hasPlus = raw.trimStart().startsWith('+');
  const digits  = raw.replace(/\D/g, '');

  if (!digits) return hasPlus ? '+' : '';

  // +33…
  if (hasPlus && digits.startsWith('33')) {
    const local = digits.slice(2, 11); // max 9 local digits
    if (!local) return '+33';
    let out = '+33 ' + local[0];
    for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
    return out;
  }

  // 07… / 06… → +33 7…
  if (!hasPlus && digits.startsWith('0')) {
    const local = digits.slice(1, 10); // strip leading 0, max 9 digits
    if (!local) return '+33';
    let out = '+33 ' + local[0];
    for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
    return out;
  }

  // +CC… — международный, максимум 15 цифр (E.164)
  if (hasPlus) {
    const country = digits.slice(0, 2);
    const rest    = digits.slice(2, 13); // 2 + 13 = 15 max
    let out = '+' + country;
    for (let i = 0; i < rest.length; i += 2) out += ' ' + rest.slice(i, i + 2);
    return out;
  }

  return digits.slice(0, 15);
}

// Полный французский номер: +33 + 9 локальных цифр.
export function isCompleteFrenchPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('33') && digits.length === 11;
}

// Валидный номер для отправки: начинается с '+', минимум 10 цифр.
// Голые цифры без '+' — невалидны (форматируются через formatPhone).
export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('+')) return false;
  return trimmed.replace(/\D/g, '').length >= 10;
}
