import { useNavigate } from 'react-router-dom';
import { useLang } from '../../i18n/LangContext';
import styles from './NotFoundPage.module.scss';

// Неизвестный адрес раньше давал полностью пустую страницу: в <Routes> не было
// маршрута "*". Устаревшая ссылка из письма или опечатка в QR приводили зрителя
// на белый экран без единой кнопки.
export function NotFoundPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isFR = lang === 'FR';

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Théâtre Tête-à-Tête</p>
      <p className={styles.code} aria-hidden="true">404</p>
      <h1 className={styles.title}>
        {isFR ? 'Page introuvable' : 'Страница не найдена'}
      </h1>
      <p className={styles.text}>
        {isFR
          ? "Cette page n'existe pas ou n'existe plus. Le lien est peut-être périmé."
          : 'Такой страницы нет или она больше не существует. Возможно, ссылка устарела.'}
      </p>
      <button className={styles.button} onClick={() => navigate('/')}>
        {isFR ? "Retour à l'accueil" : 'На главную'}
      </button>
    </main>
  );
}
