import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { REPERTOIRE, SHOWS } from '../../data/shows';
import { useLang } from '../../i18n/LangContext';
import { PosterPlaceholder } from '../ui/PosterPlaceholder';
import type { RepertoireItem, Show } from '../../types';
import styles from './Repertoire.module.scss';

// ── Repertoire item modal ─────────────────────────────────────────────────────

interface ModalProps {
  item: RepertoireItem;
  onClose: () => void;
  onBook: (show: Show) => void;
}

function RepertoireModal({ item, onClose, onBook }: ModalProps) {
  const { lang, t } = useLang();
  const desc     = lang === 'FR' ? (item.descriptionFR ?? item.description) : item.description;
  const title    = lang === 'FR' ? (item.titleFR    ?? item.title)    : item.title;
  const author   = lang === 'FR' ? (item.authorFR   ?? item.author)   : item.author;
  const duration = lang === 'FR' ? (item.durationFR ?? item.duration) : item.duration;

  const linkedShow = item.status === 'active'
    ? SHOWS.find(s => s.id === item.id) ?? null
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          <PosterPlaceholder palette={item.palette} glyph={item.glyph} title={title} kind="rep" />
        </div>

        <div className={styles.modalInfo}>
          <div className={styles.modalMeta}>
            <span className={styles.modalTag}>{t.showTags[item.tag] ?? item.tag}</span>
            <span className={styles.modalAge}>{item.age}</span>
          </div>

          <h3 className={styles.modalTitle}>{title}</h3>
          <div className={styles.modalAuthor}>{author}</div>

          {duration && (
            <div className={styles.modalDuration}>
              <span className={styles.modalDurationLabel}>{t.showModal.labelDuration}</span>
              <span>{duration}</span>
            </div>
          )}

          {desc && <p className={styles.modalDesc}>{desc}</p>}

          {linkedShow && (
            <button
              className={styles.modalBuyBtn}
              onClick={() => { onClose(); onBook(linkedShow); }}
              type="button"
            >
              <span>{lang === 'FR' ? 'Acheter un billet' : 'Купить билет'}</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Repertoire section ────────────────────────────────────────────────────────

interface Props {
  onBook: (show: Show) => void;
}

export function Repertoire({ onBook }: Props) {
  const { lang, t } = useLang();
  const [selected,      setSelected]      = useState<RepertoireItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [allForceVisible, setAllForceVisible] = useState(false);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleClose = useCallback(() => setSelected(null), []);

  // Scroll to and highlight the show from ?show= URL param.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('show');
    if (!slug || !REPERTOIRE.find(item => item.id === slug)) return;

    const doScroll = () => {
      const el = cardRefs.current.get(slug);
      if (!el) return;

      // Force ALL cards visible via React state so className never loses 'visible'
      setAllForceVisible(true);
      setHighlightedId(slug);
      setTimeout(() => setHighlightedId(null), 2000);

      // Small rAF delay so React commits the visible state before we scroll
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    };

    window.addEventListener('theatre:intro-done', doScroll);
    return () => window.removeEventListener('theatre:intro-done', doScroll);
  }, []);

  return (
    <section className={styles.repertoire} id="repertoire">
      <div className="section-head reveal">
        <div className="num">{t.repertoire.num}</div>
        <h2>{t.repertoire.title} <span className="it">{t.repertoire.titleIt}</span></h2>
        <div className="meta">{t.repertoire.metaShows(REPERTOIRE.length)}<br />{t.repertoire.metaSeason}</div>
      </div>

      <div className={styles.grid}>
        {REPERTOIRE.map((item) => {
          const cardTitle  = lang === 'FR' ? (item.titleFR  ?? item.title)  : item.title;
          const cardAuthor = lang === 'FR' ? (item.authorFR ?? item.author) : item.author;
          return (
          <button
            key={item.id}
            ref={el => {
              if (el) cardRefs.current.set(item.id, el);
              else cardRefs.current.delete(item.id);
            }}
            className={[
              styles.item,
              'reveal',
              allForceVisible ? 'visible' : '',
              highlightedId === item.id ? styles.highlighted : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setSelected(item)}
            type="button"
          >
            <div className={styles.poster}>
              <PosterPlaceholder palette={item.palette} glyph={item.glyph} title={cardTitle} kind="rep" />
            </div>
            <div className={styles.meta}>
              <span>{t.showTags[item.tag] ?? item.tag}</span>
              <span>{item.age}</span>
            </div>
            <div className={styles.title}>{cardTitle}</div>
            <div className={styles.author}>{cardAuthor}</div>

            {item.status === 'active' ? (
              <div className={styles.activeBadge}>{t.repertoire.statusActive}</div>
            ) : (
              <div className={styles.pastBadge}>{t.repertoire.statusPast}</div>
            )}

            <div className={styles.arrow}>
              {t.repertoire.more} <span className="arrow">→</span>
            </div>
          </button>
          );
        })}
      </div>

      {selected && (
        <RepertoireModal item={selected} onClose={handleClose} onBook={onBook} />
      )}
    </section>
  );
}
