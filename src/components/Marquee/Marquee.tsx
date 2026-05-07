import { useLang } from '../../i18n/LangContext';
import styles from './Marquee.module.scss';

export function Marquee() {
  const { t } = useLang();
  const line = t.marquee.join(' · ');
  return (
    <div className={styles.marquee}>
      <div className={styles.track}>
        <span>{line} · {line}</span>
      </div>
    </div>
  );
}
