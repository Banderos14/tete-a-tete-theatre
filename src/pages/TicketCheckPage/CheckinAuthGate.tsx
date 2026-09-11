// Отказ в доступе на странице проверки билетов.
//
// Если в адресе есть код билета, сотрудник уже отсканировал QR — выбрасывать
// его на главную значит потерять код и заставить сканировать заново. Поэтому
// вход показывается прямо здесь, а после него проверка продолжается сама.

import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { RU } from '../../i18n';
import { mapAuthError, isPopupClosedError } from '../../utils/authErrors';
import { parseTicketCodeFromScan } from '../../utils/parseTicketCode';
import styles from './TicketCheckPage.module.scss';

export function CheckinAuthGate({ user, ticketFromUrl, signInWithEmail, signInWithGoogle }: {
  user: User | null;
  ticketFromUrl: string;
  signInWithEmail: (email: string, password: string) => Promise<unknown>;
  signInWithGoogle: () => Promise<unknown>;
}) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(mapAuthError(err, RU.auth.errors));
    } finally { setLoading(false); }
  }

  async function handleGoogleSignIn() {
    setLoading(true); setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      if (isPopupClosedError(err)) { setLoading(false); return; }
      setError(mapAuthError(err, RU.auth.errors));
    } finally { setLoading(false); }
  }

  const scannedCode = parseTicketCodeFromScan(ticketFromUrl) ?? ticketFromUrl;

  return (
    <div className={styles.centered}>
      <p className={styles.accessDenied}>
        {user
          ? 'У этой учётной записи нет прав на проверку билетов'
          : 'Войдите как администратор, чтобы проверить билет'}
      </p>

      <p className={styles.scanHint}>
        Билет <span className={styles.mono}>{scannedCode}</span> распознан —
        после входа проверка продолжится автоматически.
      </p>

      {!user && (
        <form onSubmit={handleSignIn} className={styles.authForm}>
          <input
            className={styles.authInput}
            type="email" value={email} placeholder="E-mail"
            aria-label="E-mail" autoComplete="email" required disabled={loading}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className={styles.authInput}
            type="password" value={password} placeholder="Пароль"
            aria-label="Пароль" autoComplete="current-password" required disabled={loading}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className={styles.authError}>{error}</p>}
          <button type="submit" className={styles.scanStartBtn} disabled={loading}>
            {loading ? '…' : 'Войти'}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={handleGoogleSignIn} disabled={loading}>
            Войти через Google
          </button>
        </form>
      )}
    </div>
  );
}
