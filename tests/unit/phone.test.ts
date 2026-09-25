// Телефон зрителя: естественный ввод, хранение в E.164, показ с пробелами.
// Реализация одна — shared/domain/phone.ts (libphonenumber-js), её используют
// форма брони, кабинет и сервер.

import { describe, it, expect } from 'vitest';
import {
  parsePhone, isValidPhone, normalizePhone, formatPhoneInput, sanitizePhoneTyping,
} from '../../src/utils/phone.js';
import { validateCreateBooking } from '../../server/booking/booking.validation.js';
import { projectSource } from '../helpers/serverSource.js';

const FR_E164 = '+33749661940';

describe('Франция: один номер в любой привычной записи', () => {
  it.each([
    '07 49 66 19 40',
    '0749661940',
    '07.49.66.19.40',
    '07-49-66-19-40',
    '+33 7 49 66 19 40',
    '+33749661940',
    '+33 (0)7 49 66 19 40',
    '0033 7 49 66 19 40',
    '0033749661940',
    '  +33 7 49 66 19 40  ',
  ])('%s → +33749661940', raw => {
    expect(normalizePhone(raw)).toBe(FR_E164);
    expect(formatPhoneInput(raw)).toBe('+33 7 49 66 19 40');
    expect(isValidPhone(raw)).toBe(true);
  });

  it('городской номер тоже французский по умолчанию', () => {
    expect(normalizePhone('01 42 68 53 00')).toBe('+33142685300');
    expect(formatPhoneInput('0142685300')).toBe('+33 1 42 68 53 00');
  });
});

describe('международные номера — страна из кода, группировка по её правилам', () => {
  it.each([
    ['+380 67 123 45 67',  '+380671234567', '+380 67 123 4567'],   // Украина
    ['+380671234567',      '+380671234567', '+380 67 123 4567'],
    ['00380 67 123 45 67', '+380671234567', '+380 67 123 4567'],
    ['+7 916 123-45-67',   '+79161234567',  '+7 916 123 45 67'],   // Россия
    ['+995 555 12 34 56',  '+995555123456', '+995 555 12 34 56'],  // Грузия
    ['+40 721 234 567',    '+40721234567',  '+40 721 234 567'],    // Румыния
    ['+49 170 1234567',    '+491701234567', '+49 170 1234567'],    // Германия
    ['+1 (212) 555-0123',  '+12125550123',  '+1 212 555 0123'],    // США
  ])('%s', (raw, e164, shown) => {
    expect(normalizePhone(raw)).toBe(e164);
    expect(formatPhoneInput(raw)).toBe(shown);
  });

  it('корректный E.164 при нормализации не меняется', () => {
    for (const e164 of [FR_E164, '+380671234567', '+79161234567', '+995555123456', '+40721234567', '+12125550123']) {
      expect(normalizePhone(e164)).toBe(e164);
      // Повторная нормализация и цикл «показ → ввод → хранение» стабильны.
      expect(normalizePhone(formatPhoneInput(e164))).toBe(e164);
    }
  });

  it('трёхзначный код страны не разрывается и не превращается в французский', () => {
    expect(formatPhoneInput('+380671234567').startsWith('+380 ')).toBe(true);
    expect(normalizePhone('+380671234567').startsWith('+33')).toBe(false);
  });
});

describe('некорректный ввод', () => {
  it.each([
    '+33 7 49',           // обрывок
    '07 49 66',           // короткий локальный
    '+33 7 49 66 19 40 99',
    '380671234567',       // без кода страны и без 0 — не угадываем
    '749661940',
    'abc',
    '+33 7 49 66 19 4a',
    '07+49661940',
    '+999 123 456 789',
    '',
    '   ',
  ])('«%s» — не номер', raw => {
    expect(isValidPhone(raw)).toBe(false);
    expect(parsePhone(raw)).toBeNull();
  });
});

describe('старые записи не уничтожаются', () => {
  it('нераспознаваемый номер хранится и показывается как был', () => {
    for (const legacy of ['380671234567', '12345', 'позвонить Ане']) {
      expect(normalizePhone(legacy)).toBe(legacy);
      expect(formatPhoneInput(legacy)).toBe(legacy);
    }
  });

  it('пустое остаётся пустым', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(formatPhoneInput(null)).toBe('');
  });
});

describe('набор: без переформатирования под пальцами', () => {
  it('пробелы, +, скобки и дефисы остаются как набраны, буквы отбрасываются', () => {
    expect(sanitizePhoneTyping('07 49')).toBe('07 49');
    expect(sanitizePhoneTyping('+380 (67) 123-45')).toBe('+380 (67) 123-45');
    expect(sanitizePhoneTyping('07a49b')).toBe('0749');
  });

  it('длина ввода ограничена', () => {
    expect(sanitizePhoneTyping('1'.repeat(100))).toHaveLength(32);
  });
});

describe('формы: tel-клавиатура, автозаполнение, проверка при уходе из поля', () => {
  const inputs = [
    'src/components/ui/BookingModal/BookingFormStep.tsx',
    'src/components/ui/ProfileDrawer/PersonalSection.tsx',
    'src/components/ui/ProfileDrawer/ContactsSection.tsx',
  ].map(f => [f, projectSource(f)] as const);

  it.each(inputs)('%s', (_, src) => {
    expect(src).toContain('type="tel"');
    expect(src).toContain('inputMode="tel"');
    expect(src).toContain('autoComplete="tel"');
    expect(src).toMatch(/onBlur=\{(onPhoneBlur|form\.commitPhone)\}/);
    // Своего onPaste больше нет: вставка идёт обычным onChange.
    expect(src).not.toContain('onPaste');
  });

  it('при наборе номер только очищается, форматирование — при уходе из поля', () => {
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain('onPhoneChange={v => { setPhone(sanitizePhoneTyping(v)); setPhoneError(\'\'); }}');
    expect(modal).toContain('setPhone(formatPhoneInput(phone));');
    const form = projectSource('src/components/ui/ProfileDrawer/useProfileForm.ts');
    expect(form).toContain('setPhoneState(sanitizePhoneTyping(raw))');
    expect(form).toContain('phone: normalizePhone(phone),');
  });

  it('понятный текст ошибки на обоих языках', async () => {
    const { RU } = await import('../../src/i18n/ru');
    const { FR } = await import('../../src/i18n/fr');
    expect(RU.profile.phoneInvalid).toBe('Проверьте номер телефона');
    expect(FR.profile.phoneInvalid).toBe('Vérifiez le numéro de téléphone');
  });
});

describe('сервер хранит E.164', () => {
  const body = { showId: 'shutka', ticketType: 'standard', ticketsCount: 1, paymentMethod: 'on_site' };

  it('номер из формы в любом виде сохраняется как +33749661940', () => {
    expect(validateCreateBooking({ ...body, phone: '07 49 66 19 40' }).phone).toBe(FR_E164);
    expect(validateCreateBooking({ ...body, phone: '0033 7 49 66 19 40' }).phone).toBe(FR_E164);
    expect(validateCreateBooking({ ...body, phone: '+380 67 123 45 67' }).phone).toBe('+380671234567');
  });

  it('нераспознанный номер старого клиента не отвергается и не искажается', () => {
    expect(validateCreateBooking({ ...body, phone: '380671234567' }).phone).toBe('380671234567');
  });
});
