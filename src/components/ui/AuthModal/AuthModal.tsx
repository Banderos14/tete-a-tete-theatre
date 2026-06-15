import { useState, useEffect, type FormEvent } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { mapAuthError, isEmailInUseError, isPopupClosedError } from '../../../utils/authErrors';
import styles from './AuthModal.module.scss';

type Tab = 'signIn' | 'signUp';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: Props) {
  const { t, lang } = useLang();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();

  const [tab,          setTab]          = useState<Tab>('signIn');
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [error,        setError]        = useState('');
  const [info,         setInfo]         = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showReset,    setShowReset]    = useState(false);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setTab('signIn'); setName(''); setEmail('');
        setPassword(''); setError(''); setInfo(''); setShowReset(false);
      }, 300);
    }
  }, [open]);

  useScrollLock(open);

  function resetForm() {
    setError(''); setInfo('');
  }

  async function handleGoogle() {
    setLoading(true); resetForm();
    try {
      await signInWithGoogle();
      onClose();
    } catch (e) {
      // Попап закрыт молча — не показываем ошибку пользователю
      if (isPopupClosedError(e)) { setLoading(false); return; }
      setError(mapAuthError(e, t.auth.errors));
    } finally { setLoading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); resetForm();
    try {
      if (tab === 'signIn') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, name);
      }
      onClose();
    } catch (e) {
      // Email уже занят при регистрации → направляем пользователя на вкладку входа
      if (tab === 'signUp' && isEmailInUseError(e)) {
        setTab('signIn');
        setError(mapAuthError(e, t.auth.errors));
      } else {
        setError(mapAuthError(e, t.auth.errors));
      }
    } finally { setLoading(false); }
  }

  async function handleReset() {
    if (!email) { setError(t.auth.errors.invalidEmail); return; }
    setLoading(true); resetForm();
    try {
      await resetPassword(email);
      setInfo(t.auth.resetSent);
      setShowReset(false);
    } catch (e) {
      setError(mapAuthError(e, t.auth.errors));
    } finally { setLoading(false); }
  }

  if (!open) return null;

  return (
    <div
      className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`${styles.modal} ${open ? styles.modalVisible : ''}`} role="dialog" aria-modal="true">

        {/* Close */}
        <button className={styles.closeBtn} onClick={onClose} aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Brand */}
        <div className={styles.brand}>ТЕТ-А-ТЕТ</div>

        {/* Tabs */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'signIn'}
            className={tab === 'signIn' ? styles.tabActive : ''}
            onClick={() => { setTab('signIn'); resetForm(); setShowReset(false); }}
          >
            {t.auth.signIn}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'signUp'}
            className={tab === 'signUp' ? styles.tabActive : ''}
            onClick={() => { setTab('signUp'); resetForm(); setShowReset(false); }}
          >
            {t.auth.signUp}
          </button>
        </div>

        {/* Google */}
        <button className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t.auth.googleBtn}
        </button>

        {/* Divider */}
        <div className={styles.divider}>
          <span>{t.auth.orDivider}</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {tab === 'signUp' && (
            <div className={styles.field}>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder=" "
                required
                disabled={loading}
                autoComplete="name"
              />
              <label htmlFor="auth-name">{t.auth.nameLabel}</label>
            </div>
          )}

          <div className={styles.field}>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder=" "
              required
              disabled={loading}
              autoComplete="email"
            />
            <label htmlFor="auth-email">{t.auth.emailLabel}</label>
          </div>

          {!showReset && (
            <div className={styles.field}>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder=" "
                required
                disabled={loading}
                autoComplete={tab === 'signIn' ? 'current-password' : 'new-password'}
              />
              <label htmlFor="auth-password">{t.auth.passwordLabel}</label>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {info  && <p className={styles.info}>{info}</p>}

          {showReset ? (
            <button type="button" className={styles.submitBtn} onClick={handleReset} disabled={loading}>
              {loading ? '…' : t.auth.forgotPassword}
            </button>
          ) : (
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? '…' : tab === 'signIn' ? t.auth.signIn : t.auth.register}
            </button>
          )}
        </form>

        {/* Footer links */}
        <div className={styles.footerLinks}>
          {tab === 'signIn' && !showReset && (
            <button className={styles.textBtn} onClick={() => { setShowReset(true); resetForm(); }}>
              {t.auth.forgotPassword}
            </button>
          )}
          {showReset && (
            <button className={styles.textBtn} onClick={() => { setShowReset(false); resetForm(); }}>
              ← {t.auth.signIn}
            </button>
          )}
          <span className={styles.switchText}>
            {tab === 'signIn' ? t.auth.noAccount : t.auth.hasAccount}{' '}
            <button
              className={styles.textBtn}
              onClick={() => { setTab(tab === 'signIn' ? 'signUp' : 'signIn'); resetForm(); setShowReset(false); }}
            >
              {tab === 'signIn' ? t.auth.register : t.auth.signIn}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
