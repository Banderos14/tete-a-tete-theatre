import styles from './EmailTypoHint.module.scss';

interface Props {
  suggestion: string;
  t: { emailTypo: (s: string) => string; emailTypoFix: string; emailTypoKeep: string };
  onFix:  () => void;
  onKeep: () => void;
}

/** «Проверьте email. Возможно, вы имели в виду …?» — с исправлением в один клик. */
export function EmailTypoHint({ suggestion, t, onFix, onKeep }: Props) {
  return (
    <div className={styles.hint} role="alert">
      <p className={styles.text}>{t.emailTypo(suggestion)}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.fix} onClick={onFix}>{t.emailTypoFix}</button>
        <button type="button" className={styles.keep} onClick={onKeep}>{t.emailTypoKeep}</button>
      </div>
    </div>
  );
}
