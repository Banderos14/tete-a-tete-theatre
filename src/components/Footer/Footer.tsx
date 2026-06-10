import { useLang } from '../../i18n/LangContext';
import styles from './Footer.module.scss';

export function Footer() {
  const { t } = useLang();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <a href="#top" className={styles.mark} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src="https://static.tildacdn.net/tild6332-3234-4533-b063-336532366435/IMG_6877.PNG" alt="ТЕТ-А-ТЕТ" />
          <span>
            ТЕТ <span className={styles.dot}>·</span> А <span className={styles.dot}>·</span> ТЕТ
          </span>
          <span className={styles.mobileBrand}>Tête-à-Tête</span>
        </a>

        <div className={styles.center}>
          <div className={styles.meta}>{t.footer.copyright}</div>
          <div className={styles.credit}>Design &amp; development — Anton Shyshenko</div>
        </div>

        <button
          className={styles.backTop}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          {t.footer.backTop} <span className="arrow">↑</span>
        </button>
      </div>
    </footer>
  );
}
