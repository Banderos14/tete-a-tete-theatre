import styles from './RootErrorScreen.module.scss';

// Экран последней надежды: показывается, только если упал сам каркас приложения.
// Намеренно не использует ни контексты, ни i18n — они могут быть частью поломки.
export function RootErrorScreen() {
  const isFR = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr');

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>Théâtre Tête-à-Tête</h1>
      <p className={styles.text}>
        {isFR
          ? "Une erreur s'est produite lors du chargement de la page. Rechargez-la, s'il vous plaît."
          : 'При загрузке страницы произошла ошибка. Пожалуйста, обновите её.'}
      </p>
      <button className={styles.button} onClick={() => window.location.reload()}>
        {isFR ? 'Recharger' : 'Обновить'}
      </button>
    </div>
  );
}
