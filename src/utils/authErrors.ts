import { FirebaseError } from 'firebase/app';

// Ключи должны совпадать с T['auth']['errors'] в translations.ts
type AuthErrors = {
  invalidEmail:                     string;
  wrongPassword:                    string;
  emailInUse:                       string;
  weakPassword:                     string;
  userNotFound:                     string;
  tooManyRequests:                  string;
  popupBlocked:                     string;
  popupClosed:                      string;
  unauthorizedDomain:               string;
  accountExistsDifferentCredential: string;
  operationNotAllowed:              string;
  networkError:                     string;
  generic:                          string;
};

const ERROR_CODE_MAP: Record<string, keyof AuthErrors> = {
  'auth/invalid-email':                             'invalidEmail',
  'auth/wrong-password':                            'wrongPassword',
  'auth/invalid-credential':                        'wrongPassword',
  'auth/email-already-in-use':                      'emailInUse',
  'auth/weak-password':                             'weakPassword',
  'auth/user-not-found':                            'userNotFound',
  'auth/too-many-requests':                         'tooManyRequests',
  'auth/popup-blocked':                             'popupBlocked',
  'auth/popup-closed-by-user':                      'popupClosed',
  'auth/cancelled-popup-request':                   'popupClosed',
  'auth/unauthorized-domain':                       'unauthorizedDomain',
  'auth/account-exists-with-different-credential':  'accountExistsDifferentCredential',
  'auth/operation-not-allowed':                     'operationNotAllowed',
  'auth/network-request-failed':                    'networkError',
};

export function mapAuthError(e: unknown, errors: AuthErrors): string {
  if (!(e instanceof FirebaseError)) {
    console.error('[auth] Non-Firebase error:', e);
    return errors.generic;
  }

  const key = ERROR_CODE_MAP[e.code];
  if (!key) {
    console.error('[auth] Unmapped Firebase error code:', e.code, '|', e.message);
    return errors.generic;
  }

  return errors[key];
}

export function isEmailInUseError(e: unknown): boolean {
  return e instanceof FirebaseError && e.code === 'auth/email-already-in-use';
}

export function isPopupClosedError(e: unknown): boolean {
  return e instanceof FirebaseError && (
    e.code === 'auth/popup-closed-by-user' ||
    e.code === 'auth/cancelled-popup-request'
  );
}
