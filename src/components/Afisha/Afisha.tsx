import { useLang } from '../../i18n/LangContext';
import { AfishaSlider } from './AfishaSlider';
import styles from './Afisha.module.scss';

export function Afisha() {
  const { t } = useLang();
  const [metaLine1, metaLine2] = t.afisha.meta.split('\n');

  return (
    <section className={styles.afisha} id="afisha">
      <div className="section-head reveal">
        <div className="num">{t.afisha.num}</div>
        <h2>{t.afisha.title} <span className="it">{t.afisha.titleIt}</span></h2>
        <div className="meta">{metaLine1}<br />{metaLine2}</div>
      </div>

      <AfishaSlider />
    </section>
  );
}
