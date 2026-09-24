// Опечатки в домене почты при регистрации: подсказка, а не молчаливое исправление.

import { describe, it, expect } from 'vitest';
import { suggestEmailFix, emailTypoBlocksSubmit, KNOWN_EMAIL_TYPOS } from '../../src/utils/emailTypo';
import { projectSource } from '../helpers/serverSource.js';
import { RU as ru } from '../../src/i18n/ru';
import { FR as fr } from '../../src/i18n/fr';

describe('suggestEmailFix', () => {
  it('нормальный gmail.com — подсказки нет', () => {
    expect(suggestEmailFix('anton@gmail.com')).toBeNull();
  });

  it('gnail.com / gmial.com / gmal.com / gmai.com / gmail.co → gmail.com', () => {
    for (const typo of ['gnail.com', 'gmial.com', 'gmal.com', 'gmai.com', 'gmail.co']) {
      expect(suggestEmailFix(`anton@${typo}`)).toBe('anton@gmail.com');
    }
  });

  it('hotnail.com, outlok.com и другие провайдеры', () => {
    expect(suggestEmailFix('a@hotnail.com')).toBe('a@hotmail.com');
    expect(suggestEmailFix('a@outlok.com')).toBe('a@outlook.com');
    expect(suggestEmailFix('a@hotmial.fr')).toBe('a@hotmail.fr');
    expect(suggestEmailFix('a@yaho.fr')).toBe('a@yahoo.fr');
  });

  it('локальная часть не меняется, регистр домена и пробелы не мешают', () => {
    expect(suggestEmailFix('  Anna.Petrova+tickets@GNAIL.COM ')).toBe('Anna.Petrova+tickets@gmail.com');
  });

  it('неизвестные и корпоративные домены не трогаются', () => {
    for (const email of [
      'x@theatre-teteatete.fr', 'x@gmail.fr', 'x@mail.ru', 'x@yandex.ru', 'x@orange.fr', 'x@free.fr',
      'x@sfr.fr', 'x@laposte.net', 'x@proton.me', 'x@gmx.com', 'x@company.co', 'x@yahoo.co.uk',
      'x@hotmail.co.uk', 'x@gmail.com.au', 'x@univ-cotedazur.fr',
    ]) expect(suggestEmailFix(email)).toBeNull();
  });

  it('не адрес — подсказки нет', () => {
    for (const v of ['', 'gnail.com', 'a@@gnail.com', 'a b@gnail.com']) expect(suggestEmailFix(v)).toBeNull();
  });

  it('список консервативный: только исправления на известные домены, без циклов', () => {
    const real = new Set(Object.values(KNOWN_EMAIL_TYPOS));
    for (const [typo, fixed] of Object.entries(KNOWN_EMAIL_TYPOS)) {
      expect(typo).not.toBe(fixed);
      // Исправленный домен сам никогда не считается опечаткой.
      expect(KNOWN_EMAIL_TYPOS[fixed]).toBeUndefined();
      expect(real.has(fixed)).toBe(true);
    }
  });
});

describe('отправка формы регистрации', () => {
  it('опечатка блокирует отправку, пока адрес не исправлен или явно не подтверждён', () => {
    expect(emailTypoBlocksSubmit('anton@gnail.com', null)).toBe(true);
    // Исправление в один клик — подставлен предложенный адрес, блокировки нет.
    const fixed = suggestEmailFix('anton@gnail.com')!;
    expect(emailTypoBlocksSubmit(fixed, null)).toBe(false);
    // «Адрес верный» — подтверждён именно этот адрес.
    expect(emailTypoBlocksSubmit('anton@gnail.com', 'anton@gnail.com')).toBe(false);
    // Подтверждение другого адреса не распространяется на новый.
    expect(emailTypoBlocksSubmit('anton@gmial.com', 'anton@gnail.com')).toBe(true);
  });

  it('обычный адрес не блокируется никогда', () => {
    expect(emailTypoBlocksSubmit('anton@gmail.com', null)).toBe(false);
    expect(emailTypoBlocksSubmit('x@theatre-teteatete.fr', null)).toBe(false);
  });

  it('обе формы регистрации проверяют опечатку перед отправкой и показывают подсказку', () => {
    const auth    = projectSource('src/components/ui/AuthModal/AuthModal.tsx');
    const booking = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(auth).toContain("useEmailTypoGuard(email, setEmail, tab === 'signUp')");
    expect(auth).toMatch(/e\.preventDefault\(\);\s*if \(typo\.blocksSubmit\(\)\) return;/);
    expect(auth).toContain('<EmailTypoHint');
    expect(booking).toContain("useEmailTypoGuard(authEmail, setAuthEmail, authTab === 'signUp')");
    expect(booking).toMatch(/e\.preventDefault\(\);\s*if \(emailTypo\.blocksSubmit\(\)\) return;/);
    expect(booking).toContain('<EmailTypoHint');
  });

  it('тексты подсказки на обоих языках, с предложенным адресом', () => {
    expect(ru.auth.emailTypo('anton@gmail.com')).toBe('Проверьте email. Возможно, вы имели в виду anton@gmail.com?');
    expect(fr.auth.emailTypo('anton@gmail.com')).toContain('anton@gmail.com');
    expect(ru.auth.emailTypoFix).toBe('Исправить');
    expect(fr.auth.emailTypoFix).toBe('Corriger');
  });
});
