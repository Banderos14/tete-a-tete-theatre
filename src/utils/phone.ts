/**
 * Shared phone formatting utilities used in both BookingModal and ProfileDrawer.
 *
 * French local numbers (07…, 06…) are normalised to +33 X XX XX XX XX.
 * Explicit +33 numbers are re-formatted the same way.
 * Other +CC numbers are kept with the country code and basic 2-digit grouping.
 * Bare digits (no plus, no leading zero) are returned as-is.
 */

export function formatPhone(raw: string): string {
  const hasPlus = raw.trimStart().startsWith('+');
  const digits  = raw.replace(/\D/g, '');

  if (!digits) return hasPlus ? '+' : '';

  // ── French: +33… ──────────────────────────────────────────────────────────
  if (hasPlus && digits.startsWith('33')) {
    const local = digits.slice(2, 11); // max 9 local digits
    if (!local) return '+33';
    let out = '+33 ' + local[0];
    for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
    return out;
  }

  // ── French local: 07… / 06… → +33 7… ──────────────────────────────────────
  if (!hasPlus && digits.startsWith('0')) {
    const local = digits.slice(1, 10); // strip leading 0, max 9 digits
    if (!local) return '+33';
    let out = '+33 ' + local[0];
    for (let i = 1; i < local.length; i += 2) out += ' ' + local.slice(i, i + 2);
    return out;
  }

  // ── Other international: +CC… — capped at E.164 max 15 digits total ──────
  if (hasPlus) {
    const country = digits.slice(0, 2);
    const rest    = digits.slice(2, 13); // 2 + 13 = 15 max
    let out = '+' + country;
    for (let i = 0; i < rest.length; i += 2) out += ' ' + rest.slice(i, i + 2);
    return out;
  }

  // Bare digits — no formatting, capped at E.164 max (15 digits)
  return digits.slice(0, 15);
}

/** Returns true if phone is a complete French mobile/landline: +33 + 9 local digits. */
export function isCompleteFrenchPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('33') && digits.length === 11;
}

/**
 * Returns true if phone is a valid, submittable phone number.
 * Requires:
 *   - formatted value (must start with '+', so bare digits are rejected)
 *   - at least 10 total digits (covers +33 + 9, or any other +CC + 8+)
 *
 * Bare digit strings like '75688587880' (no leading 0 or +) are invalid.
 * Empty string is invalid.
 */
export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('+')) return false;
  return trimmed.replace(/\D/g, '').length >= 10;
}
