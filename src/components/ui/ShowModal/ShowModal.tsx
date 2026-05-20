import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../../i18n/LangContext';
import type { Show } from '../../../types';
import styles from './ShowModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
  onBook: (show: Show) => void;
}

const VISIBLE_THUMBS = 3;

export function ShowModal({ show, onClose, onBook }: Props) {
  const { lang, t } = useLang();
  const [closing,    setClosing]    = useState(false);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [thumbStart, setThumbStart] = useState(0);

  // Derived state: reset when show changes (render-time setState — React recommended pattern)
  const [stateShowId, setStateShowId] = useState<string | null>(null);
  const currentId = show?.id ?? null;
  if (currentId !== stateShowId) {
    setStateShowId(currentId);
    setActiveIdx(0);
    setThumbStart(0);
    if (currentId !== null) setClosing(false);
  }

  const allPhotos = useMemo(
    () => !show ? [] : show.photos?.length ? show.photos : show.image ? [show.image] : [],
    [show],
  );

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  const goTo = useCallback((idx: number) => {
    if (!allPhotos.length) return;
    const next = ((idx % allPhotos.length) + allPhotos.length) % allPhotos.length;
    setActiveIdx(next);
    setThumbStart(prev => {
      if (next < prev)                       return next;
      if (next >= prev + VISIBLE_THUMBS)     return Math.max(0, next - VISIBLE_THUMBS + 1);
      return prev;
    });
  }, [allPhotos.length]);

  // Lock scroll
  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  // Keyboard: ESC + arrow keys
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      handleClose();
      if (e.key === 'ArrowRight')  goTo(activeIdx + 1);
      if (e.key === 'ArrowLeft')   goTo(activeIdx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, handleClose, goTo, activeIdx]);

  if (!show) return null;

  const hasMultiple  = allPhotos.length > 1;
  const hasMoreRight = thumbStart + VISIBLE_THUMBS < allPhotos.length;
  const hasMoreLeft  = thumbStart > 0;
  const hiddenRight  = Math.max(0, allPhotos.length - thumbStart - VISIBLE_THUMBS);
  const currentPhoto = allPhotos[activeIdx];
  const desc         = lang === 'FR' ? show.descFR : show.desc;

  return createPortal(
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropOut : ''}`}
      onClick={handleClose}
    >
      <div
        className={`${styles.panel} ${closing ? styles.panelOut : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.close} onClick={handleClose} aria-label="Закрыть">✕</button>

        {/* ── Gallery ─────────────────────────────────────────────────────── */}
        <div className={styles.gallery}>

          {/* Main photo */}
          <div className={styles.mainPhoto}>
            {currentPhoto ? (
              <div
                key={activeIdx}
                className={styles.mainPhotoImg}
                style={{ backgroundImage: `url(${currentPhoto})` }}
              />
            ) : (
              <div className={styles.mainPhotoPlaceholder} style={{ background: show.palette }}>
                <span className={styles.glyphLg}>{show.glyph}</span>
              </div>
            )}

            {hasMultiple && (
              <>
                <button
                  className={`${styles.navBtn} ${styles.navPrev}`}
                  onClick={() => goTo(activeIdx - 1)}
                  aria-label="Предыдущее"
                >‹</button>
                <button
                  className={`${styles.navBtn} ${styles.navNext}`}
                  onClick={() => goTo(activeIdx + 1)}
                  aria-label="Следующее"
                >›</button>
                <span className={styles.photoCounter}>{activeIdx + 1} / {allPhotos.length}</span>
              </>
            )}
          </div>

          {/* Thumbnail strip */}
          <div className={styles.thumbRow}>
            {/* Left nav — always in layout, hidden when not needed */}
            <button
              className={styles.thumbNav}
              style={{ visibility: hasMoreLeft ? 'visible' : 'hidden' }}
              onClick={() => setThumbStart(s => Math.max(0, s - 1))}
              aria-label="Назад"
            >‹</button>

            {Array.from({ length: VISIBLE_THUMBS }).map((_, relIdx) => {
              const idx   = thumbStart + relIdx;
              const photo = allPhotos[idx];
              const isActive = idx === activeIdx;
              const showMore = relIdx === VISIBLE_THUMBS - 1 && hasMoreRight;

              if (!photo) {
                return (
                  <div
                    key={`ph-${relIdx}`}
                    className={styles.thumbPlaceholder}
                    style={{ background: show.palette }}
                  >
                    <span className={styles.glyphSm}>{show.glyph}</span>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className={`${styles.thumb} ${isActive ? styles.thumbActive : ''}`}
                  style={{ backgroundImage: `url(${photo})` }}
                  onClick={() => goTo(idx)}
                >
                  {showMore && (
                    <div className={styles.thumbMore}>+{hiddenRight}</div>
                  )}
                </div>
              );
            })}

            {/* Right nav — always in layout, hidden when not needed */}
            <button
              className={styles.thumbNav}
              style={{ visibility: hasMoreRight ? 'visible' : 'hidden' }}
              onClick={() => setThumbStart(s => Math.min(s + 1, allPhotos.length - VISIBLE_THUMBS))}
              aria-label="Вперёд"
            >›</button>
          </div>
        </div>

        {/* ── Info ────────────────────────────────────────────────────────── */}
        <div className={styles.info}>
          <div className={styles.infoHeader}>
            <span className={styles.age}>{show.age}</span>
          </div>

          <div className={styles.author}>{show.author}</div>
          <h2 className={styles.title}>{show.title}</h2>
          <div className={styles.divider} />

          <div className={styles.metaTable}>
            {([
              [t.showModal.labelDate,     `${show.day} ${t.months[show.month] ?? show.month} ${show.year}`],
              [t.showModal.labelTime,     show.time],
              [t.showModal.labelDuration, show.duration],
              [t.showModal.labelPrice,    show.price],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className={styles.metaRow}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={styles.metaValue}>{value}</span>
              </div>
            ))}
          </div>

          <p className={styles.desc}>{desc}</p>

          <button
            className={`btn btn-primary ${styles.bookBtn}`}
            onClick={() => { handleClose(); onBook(show); }}
          >
            {t.showModal.book} →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
