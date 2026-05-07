import { useLang } from '../../i18n/LangContext';
import styles from './CurtainIntro.module.scss';

interface Props {
  state: 'closed' | 'opening' | 'done';
  speed: number;
}

export function CurtainIntro({ state, speed }: Props) {
  const { t } = useLang();
  if (state === 'done') return null;

  return (
    <div
      className={`${styles.stage} ${state === 'opening' ? styles.opening : ''}`}
      style={{ '--curtain-speed': `${speed}s` } as React.CSSProperties}
    >
      <div className={styles.rod} />
      <div className={styles.light} />
      <div className={styles.panelLeft}  style={{ transitionDuration: `${speed}s` }} />
      <div className={styles.panelRight} style={{ transitionDuration: `${speed}s` }} />
      <div className={styles.logo}>
        <img src="/assets/logo.png" alt="ТЕТ-А-ТЕТ" />
        <div className={styles.logoSub}>{t.curtain.sub}</div>
      </div>
    </div>
  );
}
