import { useNavigate } from 'react-router-dom';
import { useLang } from '../../../i18n/LangContext';
import styles from './RootErrorScreen.module.scss';

// Фолбэк для упавшего маршрута: сам сайт при этом продолжает работать,
// поэтому здесь уже можно пользоваться роутером и переводами.
export function RouteErrorScreen() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isFR = lang === 'FR';

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>{isFR ? 'Erreur de chargement' : 'Ошибка загрузки'}</h1>
      <p className={styles.text}>
        {isFR
          ? "Cette page n'a pas pu être chargée. Réessayez ou revenez à l'accueil."
          : 'Не удалось загрузить эту страницу. Попробуйте ещё раз или вернитесь на главную.'}
      </p>
      <button className={styles.button} onClick={() => navigate('/')}>
        {isFR ? "Accueil" : 'На главную'}
      </button>
    </div>
  );
}
