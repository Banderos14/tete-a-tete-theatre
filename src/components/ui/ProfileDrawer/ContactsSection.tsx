// Раздел «Контакты» — только десктоп. На мобильных те же поля живут внутри
// PersonalSection, поэтому вёрстка здесь своя, а состояние общее.

import type { T } from '../../../i18n/translations';
import { Field } from './ProfileFields';
import { WhatsAppIcon, TelegramIcon } from './BrandIcons';
import { MESSENGERS, type ProfileForm } from './useProfileForm';
import styles from './ProfileDrawer.module.scss';

export function ContactsSection({ form, t }: {
  form: ProfileForm;
  t: T;
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
          onBlur={form.commitPhone}
          placeholder="06 12 34 56 78"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          className={errors.phone ? styles.inputError : ''}
        />
      </Field>

      <div className={styles.messengerRow}>
        <span className={styles.messengerLabel}>{t.profile.messengerLabel}</span>
        <div className={styles.messengerOptions}>
          {MESSENGERS.map(m => (
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
