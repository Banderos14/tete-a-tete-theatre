import { useLang } from '../../i18n/LangContext';
import styles from './Marquee.module.scss';

export function Marquee() {
  const { t } = useLang();
  const content = t.marquee.join(' · ') + ' · ';
  return (
    <div className={styles.marquee}>
      <div className={styles.track}>
        <span className={styles.group}>{content}</span>
        <span className={styles.group} aria-hidden="true">{content}</span>
      </div>
    </div>
  );
}
