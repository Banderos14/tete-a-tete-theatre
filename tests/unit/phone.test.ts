import { describe, it, expect } from 'vitest';
import { formatPhone, normalizePhone, isValidPhone, isCompleteFrenchPhone } from '../../src/utils/phone.js';

describe('французские номера — формат известен точно, группируем', () => {
  it('локальный 0X превращается в +33 X XX XX XX XX', () => {
    expect(formatPhone('0749661940')).toBe('+33 7 49 66 19 40');
  });

  it('международный +33 группируется так же', () => {
    expect(formatPhone('+33749661940')).toBe('+33 7 49 66 19 40');
  });

  it('префикс 0033 распознаётся', () => {
    expect(formatPhone('0033749661940')).toBe('+33 7 49 66 19 40');
  });

  it('частичный ввод не ломается', () => {
    expect(formatPhone('07')).toBe('+33 7');
    expect(formatPhone('0749')).toBe('+33 7 49');
  });
});

describe('прочие международные номера не искажаются', () => {
  it('трёхзначный код страны сохраняется целиком', () => {
    // Прежняя реализация давала «+38 06 71 23 45 67» — визуально другой номер.
    expect(formatPhone('+380671234567')).toBe('+380671234567');
  });

  it('двузначный код тоже остаётся как есть', () => {
    expect(formatPhone('+491701234567')).toBe('+491701234567');
  });

  it('однозначный код не разрывается', () => {
    expect(formatPhone('+12125550123')).toBe('+12125550123');
  });

  it('длина ограничена пределом E.164', () => {
    expect(formatPhone('+1234567890123456789').replace('+', '').length).toBeLessThanOrEqual(15);
  });
});

describe('хранимое значение не изменилось', () => {
  it('нормализация французского номера прежняя', () => {
    expect(normalizePhone('+33 7 49 66 19 40')).toBe('+33749661940');
    expect(normalizePhone('0749661940')).toBe('+33749661940');
  });

  it('нормализация украинского номера даёт корректный E.164', () => {
    expect(normalizePhone('+380671234567')).toBe('+380671234567');
  });

  it('формат и нормализация согласованы: normalize(format(x)) === normalize(x)', () => {
    for (const raw of ['+380671234567', '+491701234567', '0749661940', '+33749661940', '+12125550123']) {
      expect(normalizePhone(formatPhone(raw)), raw).toBe(normalizePhone(raw));
    }
  });

  it('пустой ввод даёт пустую строку', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('   ')).toBe('');
  });
});

describe('валидация', () => {
  it('принимает международные номера от 10 до 15 цифр', () => {
    expect(isValidPhone('+33749661940')).toBe(true);
    expect(isValidPhone('+380671234567')).toBe(true);
  });

  it('отклоняет номер без плюса и слишком короткий', () => {
    expect(isValidPhone('0749661940')).toBe(false);
    expect(isValidPhone('+331')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('строгая проверка французского номера не задета', () => {
    expect(isCompleteFrenchPhone('+33 7 49 66 19 40')).toBe(true);
    expect(isCompleteFrenchPhone('+33 7 49')).toBe(false);
  });
});
