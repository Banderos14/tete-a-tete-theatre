// Настройки аккаунта. На десктопе это два отдельных раздела — «Соцсети» и
// «Уведомления»; на мобильной вкладке «Настройки» они показываются вместе
// с кнопкой выхода. Общие блоки вынесены, чтобы вёрстка не разъезжалась.

import { IconLogout } from '@tabler/icons-react';
import { useLang } from '../../../i18n/LangContext';
import type { T } from '../../../i18n/translations';
import { InstagramField, Toggle } from './ProfileFields';
import { FacebookIcon } from './BrandIcons';
import { MobileSaveButtons } from './PersonalSection';
import type { ProfileForm } from './useProfileForm';
import styles from './ProfileDrawer.module.scss';

/** Кнопка привязки Facebook + поле Instagram. Заголовка не рисует. */
function SocialsBlock({ form, t, instagramFieldId }: {
  form: ProfileForm;
  t: T;
  instagramFieldId: string;
}) {
  return (
    <>
      <button
        type="button"
        className={`${styles.fbBtn} ${form.facebookLinked ? styles.fbConnected : ''}`}
        onClick={form.linkFacebookAccount}
        disabled={form.fbLoading || form.facebookLinked}
      >
        <FacebookIcon size={16} />
        {form.fbLoading ? '…' : form.facebookLinked ? t.profile.facebookConnected : t.profile.connectFacebook}
      </button>
      {form.fbError && <p className={styles.fieldError}>{form.fbError}</p>}
      <InstagramField
        t={t}
        htmlFor={instagramFieldId}
        value={form.instagramUsername}
        onChange={form.setInstagramUsername}
        normalized={form.instagram.normalized}
        valid={form.instagram.valid}
        showError={form.instagram.showError}
      />
    </>
  );
}

function NotificationsBlock({ form, t }: { form: ProfileForm; t: T }) {
  return (
    <Toggle label={t.profile.notifyShows} checked={form.notify} onChange={form.setNotify} />
  );
}

export function SocialsSection({ form, t }: { form: ProfileForm; t: T }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{t.profile.sectionSocials}</h2>
      <SocialsBlock form={form} t={t} instagramFieldId="profile-instagram" />
    </div>
  );
}

export function NotificationsSection({ form, t }: { form: ProfileForm; t: T }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{t.profile.sectionNotifications}</h2>
      <NotificationsBlock form={form} t={t} />
    </div>
  );
}

/** Мобильная вкладка «Настройки»: соцсети + уведомления + выход. */
export function SettingsSection({ form, t, onSave, onLogout }: {
  form: ProfileForm;
  t: T;
  onSave: () => void;
  onLogout: () => void;
}) {
  const { lang } = useLang();

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{t.profile.sectionSocials}</h2>
      <SocialsBlock form={form} t={t} instagramFieldId="profile-instagram-settings" />

      <div className={styles.settingsDivider} />

      <h2 className={styles.sectionTitle}>{t.profile.sectionNotifications}</h2>
      <NotificationsBlock form={form} t={t} />

      <MobileSaveButtons form={form} t={t} onSave={onSave} />

      <div className={styles.settingsDivider} />

      <button type="button" className={styles.settingsLogoutBtn} onClick={onLogout}>
        <IconLogout size={16} stroke={1.5} />
        {lang === 'FR' ? 'Se déconnecter' : 'Выйти из аккаунта'}
      </button>
    </div>
  );
}
