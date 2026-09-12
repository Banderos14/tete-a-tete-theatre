// Раздел «Личные данные». На мобильной вкладке «Профиль» он же показывает
// блок контактов и собственные кнопки сохранения — на десктопе их заменяет
// липкая строка saveRow внизу кабинета.

import { useRef } from 'react';
import { IconCalendarEvent, IconLoader2, IconPhone, IconBrandWhatsapp, IconBrandTelegram } from '@tabler/icons-react';
import { useLang } from '../../../i18n/LangContext';
import type { T } from '../../../i18n/translations';
import { PersonalField } from './ProfileFields';
import { formatBirthdayDisplay } from './profileValidation';
import { MESSENGERS, type ProfileForm } from './useProfileForm';
import styles from './ProfileDrawer.module.scss';

export function PersonalSection({
  form, t, email, nameProviderLabel, emailProviderLabel, pulseBirthday, pulsePhone, onSave,
}: {
  form: ProfileForm;
  t: T;
  email: string;
  /** «через Facebook» либо «через Google» — откуда подтянуто имя. */
  nameProviderLabel?: string;
  /** У email провайдером может быть только Google. */
  emailProviderLabel?: string;
  pulseBirthday: boolean;
  pulsePhone: boolean;
  onSave: () => void;
}) {
  const { lang } = useLang();
  const isFR = lang === 'FR';
  const { errors } = form;
  const birthdayInputRef = useRef<HTMLInputElement>(null);

  function openBirthdayPicker() {
    const input = birthdayInputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });
    try {
      input.showPicker();
    } catch {
      // При обычном клике прозрачный input сам открывает нативный календарь.
      // focus() остаётся безопасным фолбэком для браузеров без showPicker().
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.personalHeader}>
        <h2 className={styles.personalTitle}>{t.profile.sectionPersonal}</h2>
      </div>

      <PersonalField
        label={t.profile.displayName}
        htmlFor="profile-display-name"
        providerLabel={nameProviderLabel}
        error={errors.displayName}
      >
        <input
          id="profile-display-name"
          type="text"
          className={`${styles.personalInput} ${errors.displayName ? styles.personalInputError : ''}`}
          value={form.displayName}
          onChange={e => form.setDisplayName(e.target.value)}
          placeholder={t.auth.nameLabel}
          autoComplete="name"
        />
      </PersonalField>

      <PersonalField label="Email" providerLabel={emailProviderLabel}>
        <div className={styles.emailDisplay}>{email}</div>
      </PersonalField>

      <PersonalField label={t.profile.birthday} error={errors.birthday}>
        <div
          className={`${styles.birthdayField} ${errors.birthday ? styles.birthdayFieldError : ''} ${pulseBirthday && !errors.birthday ? styles.fieldPulse : ''}`}
          onClick={openBirthdayPicker}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            openBirthdayPicker();
          }}
          role="button"
          tabIndex={0}
          aria-label={isFR ? 'Choisir une date de naissance' : 'Выбрать дату рождения'}
        >
          <span className={`${styles.birthdayText} ${!form.birthday ? styles.birthdayPlaceholder : ''}`}>
            {form.birthday
              ? formatBirthdayDisplay(form.birthday, lang)
              : (isFR ? 'Choisir une date' : 'Выбрать дату')}
          </span>
          <IconCalendarEvent size={16} stroke={1.5} className={styles.birthdayIcon} />
          <input
            ref={birthdayInputRef}
            type="date"
            value={form.birthday}
            onChange={e => form.setBirthday(e.target.value)}
            className={styles.hiddenDateInput}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </PersonalField>

      {/* Contacts subsection — mobile profile tab only */}
      <div className={styles.contactsSubsection}>
        <h3 className={styles.contactsSubtitle}>{isFR ? 'Contacts' : 'Контакты'}</h3>

        <PersonalField label={isFR ? 'Téléphone' : 'Телефон'} htmlFor="profile-phone-personal" error={errors.phone}>
          <div className={styles.phoneInputWrap}>
            <input
              id="profile-phone-personal"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={e => form.setPhone(e.target.value)}
              onPaste={e => { e.preventDefault(); form.setPhone(e.clipboardData.getData('text')); }}
              placeholder="+33 6 00 00 00 00"
              autoComplete="tel"
              className={`${styles.personalInput} ${errors.phone ? styles.personalInputError : ''} ${pulsePhone && !errors.phone ? styles.fieldPulse : ''}`}
            />
            <IconPhone size={16} stroke={1.5} className={styles.phoneInputIcon} />
          </div>
        </PersonalField>

        <div className={styles.personalFieldWrap}>
          <div className={styles.personalFieldLabel}>
            <span className={styles.personalFieldLabelText}>{isFR ? 'Via' : 'Связь через'}</span>
          </div>
          <div className={styles.contactMessengerOptions}>
            {MESSENGERS.map(m => (
              <button
                key={m}
                type="button"
                className={`${styles.contactMessengerBtn} ${form.preferredContact.includes(m) ? styles.contactMessengerBtnActive : ''}`}
                onClick={() => form.toggleMessenger(m)}
              >
                {m === 'whatsapp'
                  ? <IconBrandWhatsapp size={16} stroke={1.5} />
                  : <IconBrandTelegram size={16} stroke={1.5} />}
                {m === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MobileSaveButtons form={form} t={t} onSave={onSave} />
    </div>
  );
}

/** Кнопки сохранения для мобильных вкладок — на десктопе скрыты стилями. */
export function MobileSaveButtons({ form, t, onSave }: { form: ProfileForm; t: T; onSave: () => void }) {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  return (
    <div className={styles.mobileSaveButtons}>
      <button type="button" className={styles.cancelBtn} onClick={form.reset} disabled={form.saving}>
        {isFR ? 'Annuler' : 'Отмена'}
      </button>
      <button type="button" className={styles.saveBtnMobile} onClick={onSave} disabled={form.saving}>
        {form.saving
          ? <IconLoader2 size={15} stroke={1.5} className={styles.saveBtnSpinner} />
          : t.profile.save}
      </button>
      {form.savedMsg && (
        <span className={styles.savedStatusMobile}>{isFR ? 'Enregistré' : 'Сохранено'}</span>
      )}
    </div>
  );
}
