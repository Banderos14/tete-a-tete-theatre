import { useState, useCallback } from 'react';
import { useLang } from '../../i18n/LangContext';
import { AfishaSlider } from './AfishaSlider';
import { ShowModal } from '../ui/ShowModal';
import type { Show } from '../../types';
import styles from './Afisha.module.scss';

interface Props {
  onBook: (show: Show) => void;
}

export function Afisha({ onBook }: Props) {
  const { t } = useLang();
  const [metaLine1, metaLine2] = t.afisha.meta.split('\n');
  const [activeShow, setActiveShow] = useState<Show | null>(null);

  const handleCardClick = useCallback((show: Show) => setActiveShow(show), []);
  const handleClose     = useCallback(() => setActiveShow(null), []);

  return (
    <section className={styles.afisha} id="afisha">
      <div className="section-head reveal">
        <div className="num">{t.afisha.num}</div>
        <h2>{t.afisha.title} <span className="it">{t.afisha.titleIt}</span></h2>
        <div className="meta">{metaLine1}<br />{metaLine2}</div>
      </div>

      <AfishaSlider onCardClick={handleCardClick} />
      <ShowModal show={activeShow} onClose={handleClose} onBook={onBook} />
    </section>
  );
}
