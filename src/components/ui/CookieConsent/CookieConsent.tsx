import { useEffect, useState } from 'react';
import { useLang } from '../../../i18n/LangContext';
import { readStoredConsent, storeConsent, loadAnalytics, applyStoredConsent } from '../../../services/analytics';
import styles from './CookieConsent.module.scss';

// Небольшой баннер согласия — намеренно без полноценной CMP.
// Нужен ровно для одного: GA4 не должен стартовать до выбора пользователя.
export function CookieConsent() {
  const { lang } = useLang();
  const isFR = lang === 'FR';

  // null = выбор ещё не сделан, баннер показывается.
  const [decided, setDecided] = useState<boolean>(true);

  useEffect(() => {
    // Применяем сохранённый выбор и решаем, показывать ли баннер.
    applyStoredConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecided(readStoredConsent() !== null);
  }, []);

  if (decided) return null;

  function decide(value: 'granted' | 'denied') {
    storeConsent(value);
    if (value === 'granted') loadAnalytics();
    setDecided(true);
  }

  return (
    <div className={styles.banner} role="dialog" aria-live="polite"
         aria-label={isFR ? 'Consentement aux cookies' : 'Согласие на использование cookie'}>
      <p className={styles.text}>
        {isFR
          ? 'Nous utilisons des cookies de mesure d’audience pour comprendre comment le site est utilisé. Ils ne sont déposés qu’avec votre accord.'
          : 'Мы используем аналитические cookie, чтобы понимать, как посетители пользуются сайтом. Они устанавливаются только с вашего согласия.'}
      </p>
      <div className={styles.actions}>
        <button className={styles.decline} onClick={() => decide('denied')}>
          {isFR ? 'Refuser' : 'Отказаться'}
        </button>
        <button className={styles.accept} onClick={() => decide('granted')}>
          {isFR ? 'Accepter' : 'Принять'}
        </button>
      </div>
    </div>
  );
}
