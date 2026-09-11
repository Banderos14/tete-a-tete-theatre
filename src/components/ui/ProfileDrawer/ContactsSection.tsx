// Раздел «Контакты» — только десктоп. На мобильных те же поля живут внутри
// PersonalSection, поэтому вёрстка здесь своя, а состояние общее.

import type { T } from '../../../i18n/translations';
import { Field } from './ProfileFields';
import { WhatsAppIcon, TelegramIcon } from './BrandIcons';
import type { ProfileForm, Messenger } from './useProfileForm';
import styles from './ProfileDrawer.module.scss';

export function ContactsSection({ form, t, pulsePhone }: {
  form: ProfileForm;
  t: T;
  pulsePhone: boolean;
}) {
  const { errors } = form;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{t.profile.sectionContacts}</h2>

      <Field label={t.profile.phone} htmlFor="profile-phone-contacts" error={errors.phone}>
        <input
          id="profile-phone-contacts"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={e => form.setPhone(e.target.value)}
          onPaste={e => { e.preventDefault(); form.setPhone(e.clipboardData.getData('text')); }}
          placeholder="+33 6 00 00 00 00"
          autoComplete="tel"
          className={`${errors.phone ? styles.inputError : ''} ${pulsePhone && !errors.phone ? styles.fieldPulse : ''}`}
        />
      </Field>

      <div className={styles.messengerRow}>
        <span className={styles.messengerLabel}>{t.profile.messengerLabel}</span>
        <div className={styles.messengerOptions}>
          {(['whatsapp', 'telegram'] as const satisfies readonly Messenger[]).map(m => (
            <button
              key={m}
              type="button"
              className={`${styles.messengerBtn} ${form.preferredContact.includes(m) ? styles.active : ''}`}
              onClick={() => form.toggleMessenger(m)}
            >
              {m === 'whatsapp' ? <WhatsAppIcon /> : <TelegramIcon />}
              {m === 'whatsapp' ? t.profile.messengerWhatsapp : t.profile.messengerTelegram}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
