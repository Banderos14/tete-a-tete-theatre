// Примитивы формы кабинета: обёртки поля с лейблом и ошибкой плюс переключатель.
// Собственной логики не несут — только разметка, общая для всех разделов.

import type { CSSProperties, ReactNode } from 'react';
import { IconLock, IconBrandInstagram } from '@tabler/icons-react';
import type { T } from '../../../i18n/translations';
import { instagramProfileUrl } from '../../../utils/instagram';
import styles from './ProfileDrawer.module.scss';

export function Field({
  label, error, children, style, htmlFor,
}: {
  label: ReactNode;
  error?: string;
  children: ReactNode;
  style?: CSSProperties;
  htmlFor?: string;
}) {
  return (
    <div className={styles.field} style={style}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

/** Поле раздела «Личные данные»: лейбл с пометкой провайдера (Google/Facebook). */
export function PersonalField({
  label, providerLabel, error, children, htmlFor,
}: {
  label: ReactNode;
  providerLabel?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={styles.personalFieldWrap}>
      <div className={styles.personalFieldLabel}>
        <label className={styles.personalFieldLabelText} htmlFor={htmlFor}>{label}</label>
        {providerLabel && (
          <span className={styles.providerLabel}>
            <IconLock size={10} stroke={1.5} />
            {providerLabel}
          </span>
        )}
      </div>
      {children}
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}

export function InstagramField({ t, htmlFor, value, onChange, normalized, valid, showError }: {
  t: T;
  htmlFor: string;
  value: string;
  onChange: (v: string) => void;
  normalized: string;
  valid: boolean;
  showError: boolean;
}) {
  return (
    <Field
      label={
        <span className={styles.instagramLabel}>
          <IconBrandInstagram size={14} stroke={1.5} />
          {t.profile.instagram}
        </span>
      }
      htmlFor={htmlFor}
      style={{ marginTop: 16 }}
    >
      <input
        id={htmlFor}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t.profile.instagramPlaceholder}
        autoComplete="off"
      />
      {showError && <p className={styles.fieldError}>{t.profile.instagramInvalid}</p>}
      {valid && (
        <a
          href={instagramProfileUrl(normalized)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.instagramOpenLink}
        >
          @{normalized} · {t.profile.instagramOpenProfile}
        </a>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <span
        className={`${styles.toggleTrack} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onChange(!checked); }}
      >
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}
