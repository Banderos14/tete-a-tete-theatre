import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Lang } from '../i18n/translations';

// Синхронизация языка с профилем.
//
// Раньше связь была односторонней: локальный выбор писался в профиль, но профиль
// язык никогда не восстанавливал — франкоязычный зритель на новом устройстве
// видел русскую версию.
//
// Теперь при первом появлении профиля язык применяется ИЗ него (один раз, если
// пользователь не менял язык руками в этой сессии), а дальше работает прежняя
// запись локального выбора в профиль. Флаг appliedRef не даёт возникнуть петле.
export function UserLanguageSync({ lang, onLangFromProfile }: {
  lang: Lang;
  onLangFromProfile: (l: Lang) => void;
}) {
  const { user, userProfile, saveProfile } = useAuth();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!user || !userProfile) return;

    const profileLang: Lang = userProfile.language === 'fr' ? 'FR' : 'RU';

    // Один раз после входа: восстанавливаем язык из профиля.
    if (!appliedRef.current) {
      appliedRef.current = true;
      if (profileLang !== lang) { onLangFromProfile(profileLang); return; }
    }

    // Дальше — обычная запись локального выбора в профиль.
    const language = lang === 'FR' ? 'fr' : 'ru';
    if (userProfile.language === language) return;
    void saveProfile({ language });
  }, [lang, saveProfile, user, userProfile, onLangFromProfile]);

  useEffect(() => {
    // Смена пользователя — снова разрешаем применить язык из профиля.
    if (!user) appliedRef.current = false;
  }, [user]);

  return null;
}
