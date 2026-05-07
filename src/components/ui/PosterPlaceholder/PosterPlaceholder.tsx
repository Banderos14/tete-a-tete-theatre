import styles from './PosterPlaceholder.module.scss';

interface Props {
  palette: string;
  glyph: string;
  title: string;
  kind?: 'show' | 'rep';
}

export function PosterPlaceholder({ palette, glyph, title, kind = 'show' }: Props) {
  return (
    <div className={styles.placeholder} style={{ background: palette }}>
      <div className={styles.scanlines} />
      <div className={styles.spotlight} />
      <div className={styles.glyph}>{glyph}</div>
      <div className={`${styles.title} ${kind === 'rep' ? styles.titleRep : ''}`}>{title}</div>
    </div>
  );
}
