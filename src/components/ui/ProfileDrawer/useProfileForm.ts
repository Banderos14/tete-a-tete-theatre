// Состояние формы профиля: поля, валидация, сохранение и привязка Facebook.
// Вынесено из ProfileDrawer, чтобы разделы кабинета получали один объект формы
// вместо двух десятков пропов, а сам ProfileDrawer отвечал только за оболочку.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { formatPhone, normalizePhone, isCompleteFrenchPhone } from '../../../utils/phone';
import {
  extractInstagramUsername,
  isValidInstagramUsername,
  resolveInstagramUsername,
} from '../../../utils/instagram';
import { validate, mapFbError, type ValidationErrors } from './profileValidation';

export type Messenger = 'whatsapp' | 'telegram';

export interface ProfileForm {
  displayName: string;
  birthday: string;
  phone: string;
  preferredContact: string[];
  instagramUsername: string;
  notify: boolean;

  setDisplayName: (v: string) => void;
  setBirthday: (v: string) => void;
  setPhone: (raw: string) => void;
  toggleMessenger: (m: Messenger) => void;
  setInstagramUsername: (v: string) => void;
  setNotify: (v: boolean) => void;

  errors: ValidationErrors;
  saving: boolean;
  savedMsg: boolean;
  isDirty: boolean;
  /** Сколько обязательных полей ещё не заполнено — для бейджа в сайдбаре. */
  missingCount: number;
  missingBirthday: boolean;
  missingPhone: boolean;
  instagram: { normalized: string; valid: boolean; showError: boolean };

  /**
   * Сохраняет профиль. С `{ withValidation: true }` сначала проверяет поля и,
   * если есть ошибки, ничего не пишет и возвращает их — вызывающий сам решает,
   * переключать ли раздел.
   */
  save: (opts?: { withValidation?: boolean }) => Promise<ValidationErrors>;
  reset: () => void;

  /** Facebook уже привязан — кнопку привязки показываем неактивной. */
  facebookLinked: boolean;
  fbLoading: boolean;
  fbError: string;
  linkFacebookAccount: () => Promise<void>;
}

export function useProfileForm(): ProfileForm {
  const { lang, t } = useLang();
  const { user, userProfile, saveProfile, linkFacebook, clearBadSocialLink } = useAuth();

  const [displayName, setDisplayNameState] = useState('');
  const [birthday,    setBirthdayState]    = useState('');
  const [phone,       setPhoneState]       = useState('');
  const [preferredContact,  setPreferredContact]  = useState<string[]>(['whatsapp']);
  const [instagramUsername, setInstagramState]    = useState('');
  const [notify,      setNotifyState]      = useState(true);

  const [saving,    setSaving]    = useState(false);
  const [savedMsg,  setSavedMsg]  = useState(false);
  const [errors,    setErrors]    = useState<ValidationErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isDirty,   setIsDirty]   = useState(false);

  const [fbLoading, setFbLoading] = useState(false);
  const [fbError,   setFbError]   = useState('');

  // Синхронизация полей формы из Firestore
  useEffect(() => {
    if (!userProfile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayNameState(userProfile.displayName || user?.displayName || '');
    setBirthdayState(userProfile.birthday ?? '');
    setPhoneState(formatPhone(userProfile.phone ?? ''));
    setPreferredContact(userProfile.preferredContact ?? ['whatsapp']);
    // Старый баг: Facebook access token сохранялся как socialLink — чистим.
    if ((userProfile.socialLink ?? '').startsWith('https://facebook.com/EAA')) clearBadSocialLink();
    setInstagramState(resolveInstagramUsername(userProfile));
    setNotifyState(userProfile.notifications ?? true);
    setIsDirty(false);
    setErrors({});
    setSubmitted(false);
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Пока форма не отправлялась, ошибки не показываем — иначе поля краснеют,
  // не дав пользователю и шанса их заполнить.
  useEffect(() => {
    if (submitted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrors(validate(displayName, birthday, phone, t.profile.required, t.profile.phoneInvalid));
    }
  }, [displayName, birthday, phone, submitted, t.profile.required, t.profile.phoneInvalid]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const setDisplayName = useCallback((v: string) => { setDisplayNameState(v); markDirty(); }, [markDirty]);
  const setBirthday    = useCallback((v: string) => { setBirthdayState(v);    markDirty(); }, [markDirty]);
  const setPhone       = useCallback((raw: string) => { setPhoneState(formatPhone(raw)); markDirty(); }, [markDirty]);
  const setInstagramUsername = useCallback((v: string) => { setInstagramState(v); markDirty(); }, [markDirty]);
  const setNotify      = useCallback((v: boolean) => { setNotifyState(v); markDirty(); }, [markDirty]);

  const toggleMessenger = useCallback((m: Messenger) => {
    setPreferredContact(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    markDirty();
  }, [markDirty]);

  async function save({ withValidation = false }: { withValidation?: boolean } = {}): Promise<ValidationErrors> {
    if (withValidation) {
      setSubmitted(true);
      const errs = validate(displayName, birthday, phone, t.profile.required, t.profile.phoneInvalid);
      setErrors(errs);
      if (Object.keys(errs).length > 0) return errs;
    }
    setSaving(true);
    await saveProfile({
      displayName,
      birthday,
      phone: normalizePhone(phone),
      preferredContact,
      instagramUsername: extractInstagramUsername(instagramUsername),
      notifications: notify,
    });
    setSaving(false);
    setSavedMsg(true);
    setIsDirty(false);
    setTimeout(() => setSavedMsg(false), 4000);
    return {};
  }

  function reset() {
    setDisplayNameState(userProfile?.displayName || user?.displayName || '');
    setBirthdayState(userProfile?.birthday ?? '');
    setPhoneState(formatPhone(userProfile?.phone ?? ''));
    setPreferredContact(userProfile?.preferredContact ?? ['whatsapp']);
    setInstagramState(userProfile ? resolveInstagramUsername(userProfile) : '');
    setNotifyState(userProfile?.notifications ?? true);
    setIsDirty(false);
    setErrors({});
    setSubmitted(false);
  }

  const linkFacebookAccount = useCallback(async () => {
    setFbError('');
    setFbLoading(true);
    try {
      const { name, birthday: bd } = await linkFacebook();
      if (name) { setDisplayNameState(name); markDirty(); }
      if (bd)   { setBirthdayState(bd);      markDirty(); }
    } catch (err) {
      setFbError(mapFbError(err, lang));
    } finally {
      setFbLoading(false);
    }
  }, [linkFacebook, markDirty, lang]);

  const instagramNormalized = extractInstagramUsername(instagramUsername);

  return {
    displayName, birthday, phone, preferredContact, instagramUsername, notify,
    setDisplayName, setBirthday, setPhone, toggleMessenger, setInstagramUsername, setNotify,
    errors, saving, savedMsg, isDirty,
    missingCount: Object.keys(
      validate(displayName, birthday, phone, t.profile.required, t.profile.phoneInvalid),
    ).length,
    missingBirthday: !birthday,
    missingPhone: !phone.trim() || !isCompleteFrenchPhone(phone),
    instagram: {
      normalized: instagramNormalized,
      valid: instagramNormalized.length > 0 && isValidInstagramUsername(instagramNormalized),
      showError: instagramUsername.trim().length > 0 && instagramNormalized.length === 0,
    },
    save, reset,
    facebookLinked: userProfile?.facebookLinked ?? false,
    fbLoading, fbError, linkFacebookAccount,
  };
}
