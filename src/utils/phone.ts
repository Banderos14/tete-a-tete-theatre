// Phone utilities shared by BookingModal and ProfileDrawer.
//
// formatPhone()   — display format with spaces (+33 7 49 66 19 40)
// normalizePhone()— E.164 storage format without spaces (+33749661940)
// isValidPhone()  — accepts French and any international +CC number
// isCompleteFrenchPhone() — strict French check used in profile validation

// Formats 9 local French digits as +33 X XX XX XX XX
function formatFrench(local: string): string {
  if (!local) return '+33';
  let out = '+33 ' + local[0];
  for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
  return out;
}

export function formatPhone(raw: string): string {
  const hasPlus = raw.trimStart().startsWith('+');
  const digits  = raw.replace(/\D/g, '');

  if (!digits) return hasPlus ? '+' : '';

  // 0033… — international dialing prefix (France → +33)
  if (digits.startsWith('0033')) {
    return formatFrench(digits.slice(4, 13));
  }

  // 033… + 9 national digits (user typed single 0 instead of 00 before country code).
  // Only trigger when there are enough digits to be a full French E.164 number (12 total).
  // Shorter numbers starting with 033 (e.g. 0334000000) fall through to the 0X case below.
  if (!hasPlus && digits.startsWith('033') && digits.length >= 12) {
    return formatFrench(digits.slice(3, 12));
  }

  // +33… → French mobile/fixed
  if (hasPlus && digits.startsWith('33')) {
    return formatFrench(digits.slice(2, 11));
  }

  // 07… / 06… / 0X… → French local → +33 X…
  if (!hasPlus && digits.startsWith('0')) {
    return formatFrench(digits.slice(1, 10));
  }

  // +CC… — other international, max 15 digits (E.164)
  if (hasPlus) {
    const country = digits.slice(0, 2);
    const rest    = digits.slice(2, 13);
    let out = '+' + country;
    for (let i = 0; i < rest.length; i += 2) out += ' ' + rest.slice(i, i + 2);
    return out;
  }

  return digits.slice(0, 15);
}

// Returns E.164 compact form for Firestore storage (no spaces).
// Examples: "+33 7 49 66 19 40" → "+33749661940", "+380 67 123 45 67" → "+380671234567"
export function normalizePhone(raw: string): string {
  if (!raw.trim()) return '';
  const formatted = formatPhone(raw.trim());
  return formatted.replace(/[^\d+]/g, '');
}

// True when the phone is a complete French number: +33 + exactly 9 national digits.
export function isCompleteFrenchPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('33') && digits.length === 11;
}

// True when the phone is a valid international number: starts with +, 10–15 digits total.
// Accepts French and any other country code. Used for booking validation.
export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('+')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}
