import { LOGO_SRC, LOGO_WIDTH, LOGO_HEIGHT } from '../../../../constants/links';
import { useLang } from '../../../../i18n/LangContext';
import { scrollToSection } from '../../../../utils/smoothScroll';
import styles from './Footer.module.scss';

export function Footer() {
  const { t } = useLang();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <a href="#top" className={styles.mark} onClick={(e) => { e.preventDefault(); scrollToSection('top', { offset: 0 }); }}>
          <img src={LOGO_SRC} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="Théâtre Tête-à-Tête" />
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
          onClick={() => scrollToSection('top', { offset: 0 })}
        >
          {t.footer.backTop} <span className="arrow">↑</span>
        </button>
      </div>
    </footer>
  );
}
