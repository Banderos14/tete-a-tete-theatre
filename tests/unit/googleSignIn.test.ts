// Вход через Google: минимальные scope, быстрый попап, спокойная реакция на
// закрытие окна и сбои сети, никаких обязательных полей после входа.

import { describe, it, expect } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { mapAuthError, isPopupClosedError } from '../../src/utils/authErrors';
import { RU } from '../../src/i18n/ru';
import { projectSource } from '../helpers/serverSource.js';

const auth = projectSource('src/context/AuthContext.tsx');
const signIn = auth.slice(auth.indexOf('async function signInWithGoogle'), auth.indexOf('async function signInWithEmail'));

describe('Google: только базовые данные аккаунта', () => {
  it('никаких дополнительных scope — ни даты рождения, ни телефона из People API', () => {
    expect(signIn).toContain('new fb.GoogleAuthProvider()');
    expect(signIn).not.toContain('addScope');
    expect(auth).not.toMatch(/user\.birthday\.read|user\.phonenumbers\.read|people\.googleapis/);
  });

  it('выбор аккаунта остаётся — билет уходит на e-mail выбранного аккаунта', () => {
    expect(signIn).toContain("provider.setCustomParameters({ prompt: 'select_account' });");
  });
});

describe('Google: скорость', () => {
  it('попап открывается без ожидания, если Firebase уже загружен (жест пользователя не теряется)', () => {
    expect(auth).toContain("import('../firebase/config').then(m => (_loaded = m))");
    expect(signIn).toContain('const fb = _loaded ?? await loadFirebase();');
    // До signInWithPopup нет других await.
    const beforePopup = signIn.slice(0, signIn.indexOf('const result = await fb.signInWithPopup'));
    expect(beforePopup.match(/await /g)).toHaveLength(1);
  });

  it('окно входа не ждёт Firestore: профиль догружается после ответа Google', () => {
    const afterPopup = signIn.slice(signIn.indexOf('fb.signInWithPopup'));
    expect(afterPopup).toContain('setUser(result.user);');
    expect(afterPopup).not.toMatch(/await loadUserProfile|await ensureUserDocument/);
  });

  it('профиль при входе запрашивается один раз: вход и onAuthStateChanged делят запрос', () => {
    expect(auth).toContain('const profileRequests = new Map<string, Promise<UserProfile>>();');
    // ensureUserDocument вызывается только внутри loadUserProfile.
    const calls = auth.match(/ensureUserDocument\(/g) ?? [];
    expect(calls).toHaveLength(2); // объявление + вызов в loadUserProfile
    expect(auth).toContain('const profile = await loadUserProfile(firebaseUser);');
  });
});

describe('Google: отмена и ошибки', () => {
  const err = (code: string) => new FirebaseError(code, code);

  it('закрытый попап и повторный клик — не ошибка, форма просто снова доступна', () => {
    expect(isPopupClosedError(err('auth/popup-closed-by-user'))).toBe(true);
    expect(isPopupClosedError(err('auth/cancelled-popup-request'))).toBe(true);
    expect(isPopupClosedError(err('auth/network-request-failed'))).toBe(false);
    for (const file of ['src/components/ui/AuthModal/AuthModal.tsx', 'src/components/ui/BookingModal/BookingModal.tsx']) {
      const src = projectSource(file);
      const handler = src.slice(src.indexOf('async function handleGoogle'), src.indexOf('async function', src.indexOf('async function handleGoogle') + 10));
      expect(handler, file).toMatch(/if \(isPopupClosedError\(e\)\) \{ set\w*Loading\(false\); return; \}/);
      expect(handler, file).toMatch(/finally \{ set\w*Loading\(false\); \}/);
    }
  });

  it('сеть, заблокированный попап, занятый e-mail и неразрешённый домен — понятный текст', () => {
    const e = RU.auth.errors;
    expect(mapAuthError(err('auth/network-request-failed'), e)).toBe(e.networkError);
    expect(mapAuthError(err('auth/popup-blocked'), e)).toBe(e.popupBlocked);
    expect(mapAuthError(err('auth/account-exists-with-different-credential'), e)).toBe(e.accountExistsDifferentCredential);
    expect(mapAuthError(err('auth/unauthorized-domain'), e)).toBe(e.unauthorizedDomain);
  });
});

describe('после входа ничего не требуется заполнять', () => {
  it('бронь открывает форму сразу после входа — без проверки профиля', () => {
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain("if (user && step === 'auth') setStep('form');");
    expect(modal).not.toMatch(/birthday/);
  });

  it('новый профиль создаётся без даты рождения и телефона — и это валидный профиль', () => {
    expect(auth).toContain("displayName: '', email: '', phone: '',");
    const validation = projectSource('src/components/ui/ProfileDrawer/profileValidation.ts');
    expect(validation).not.toMatch(/!birthday\)|errors\.birthday\s*=\s*messages\.required|errors\.phone\s*=\s*messages\.required/);
  });

  it('сервер брони не читает дату рождения', () => {
    for (const file of ['server/booking/booking.service.ts', 'server/booking/booking.validation.ts', 'shared/domain/loyalty.ts']) {
      expect(projectSource(file), file).not.toMatch(/birthday/i);
    }
  });
});
