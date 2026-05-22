import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { REPERTOIRE } from '../../data/shows';
import { useLang } from '../../i18n/LangContext';
import { PosterPlaceholder } from '../ui/PosterPlaceholder';
import type { RepertoireItem } from '../../types';
import styles from './Repertoire.module.scss';

// ── Repertoire item modal ─────────────────────────────────────────────────────

interface ModalProps {
  item: RepertoireItem;
  onClose: () => void;
}

function RepertoireModal({ item, onClose }: ModalProps) {
  const { lang, t } = useLang();
  const desc = lang === 'FR' ? (item.descriptionFR ?? item.description) : item.description;

  // ESC key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div
      className={styles.modalBackdrop}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modalPanel} role="dialog" aria-modal="true">
        <button className={styles.modalClose} onClick={onClose} aria-label="Закрыть">✕</button>

        <div className={styles.modalPoster}>
          <PosterPlaceholder palette={item.palette} glyph={item.glyph} title={item.title} kind="rep" />
        </div>

        <div className={styles.modalInfo}>
          <div className={styles.modalMeta}>
            <span className={styles.modalTag}>{t.showTags[item.tag] ?? item.tag}</span>
            <span className={styles.modalAge}>{item.age}</span>
          </div>

          <h3 className={styles.modalTitle}>{item.title}</h3>
          <div className={styles.modalAuthor}>{item.author}</div>

          {item.duration && (
            <div className={styles.modalDuration}>
              <span className={styles.modalDurationLabel}>{t.showModal.labelDuration}</span>
              <span>{item.duration}</span>
            </div>
          )}

          {desc && <p className={styles.modalDesc}>{desc}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Repertoire section ────────────────────────────────────────────────────────

export function Repertoire() {
  const { t } = useLang();
  const [selected, setSelected] = useState<RepertoireItem | null>(null);

  const handleClose = useCallback(() => setSelected(null), []);

  return (
    <section className={styles.repertoire} id="repertoire">
      <div className="section-head reveal">
        <div className="num">{t.repertoire.num}</div>
        <h2>{t.repertoire.title} <span className="it">{t.repertoire.titleIt}</span></h2>
        <div className="meta">{t.repertoire.metaShows(REPERTOIRE.length)}<br />{t.repertoire.metaSeason}</div>
      </div>

      <div className={styles.grid}>
        {REPERTOIRE.map((item, i) => (
          <button
            key={i}
            className={`${styles.item} reveal`}
            style={{ transitionDelay: `${(i % 4) * 60}ms` }}
            onClick={() => setSelected(item)}
            type="button"
          >
            <div className={styles.poster}>
              <PosterPlaceholder palette={item.palette} glyph={item.glyph} title={item.title} kind="rep" />
            </div>
            <div className={styles.meta}>
              <span>{t.showTags[item.tag] ?? item.tag}</span>
              <span>{item.age}</span>
            </div>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.author}>{item.author}</div>
            <div className={styles.arrow}>
              {t.repertoire.more} <span className="arrow">→</span>
            </div>
          </button>
        ))}
      </div>

      {selected && <RepertoireModal item={selected} onClose={handleClose} />}
    </section>
  );
}
