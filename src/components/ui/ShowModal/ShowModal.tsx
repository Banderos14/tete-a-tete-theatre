import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { createPortal } from 'react-dom';
import { useLang } from '../../../i18n/LangContext';
import type { Show } from '../../../types';
import { subscribeToShowBookedSeats } from '../../../services/bookingService';
import { THEATRE_CAPACITY } from '../../../config/theatre';
import styles from './ShowModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
  onBook: (show: Show) => void;
}

const VISIBLE_THUMBS = 3;

export function ShowModal({ show, onClose, onBook }: Props) {
  const { lang, t } = useLang();
  const [closing,      setClosing]      = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [thumbStart,   setThumbStart]   = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [bookedSeats,  setBookedSeats]  = useState(0);

  // Derived state: reset when show changes (render-time setState — React recommended pattern)
  const [stateShowId, setStateShowId] = useState<string | null>(null);
  const currentId = show?.id ?? null;
  if (currentId !== stateShowId) {
    setStateShowId(currentId);
    setActiveIdx(0);
    setThumbStart(0);
    setDescExpanded(false);
    setBookedSeats(0);
    if (currentId !== null) setClosing(false);
  }

  const allPhotos = useMemo(
    () => !show ? [] : show.photos?.length ? show.photos : show.image ? [show.image] : [],
    [show],
  );

  // Realtime available seats: subscribe when show opens, unsubscribe on close/change
  useEffect(() => {
    if (!show) return;
    return subscribeToShowBookedSeats(show.id, setBookedSeats);
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableSeats = Math.max(0, THEATRE_CAPACITY - bookedSeats);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  const goTo = useCallback((idx: number) => {
    if (!allPhotos.length) return;
    const next = ((idx % allPhotos.length) + allPhotos.length) % allPhotos.length;
    setActiveIdx(next);
    setThumbStart(prev => {
      if (next < prev)                    return next;
      if (next >= prev + VISIBLE_THUMBS)  return Math.max(0, next - VISIBLE_THUMBS + 1);
      return prev;
    });
  }, [allPhotos.length]);

  useScrollLock(!!show);

  // Keyboard: ESC + arrow keys
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     handleClose();
      if (e.key === 'ArrowRight') goTo(activeIdx + 1);
      if (e.key === 'ArrowLeft')  goTo(activeIdx - 1);
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
  const desc         = lang === 'FR' ? show.descFR           : show.desc;
  const title        = lang === 'FR' ? (show.titleFR    ?? show.title)    : show.title;
  const author       = lang === 'FR' ? (show.authorFR   ?? show.author)   : show.author;
  const duration     = lang === 'FR' ? (show.durationFR ?? show.duration) : show.duration;
  const price        = lang === 'FR' ? (show.priceFR    ?? show.price)    : show.price;
  const monthLabel   = t.months[show.month] ?? show.month;

  return createPortal(
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropOut : ''}`}
      onClick={handleClose}
    >
      <div
        className={`${styles.panel} ${closing ? styles.panelOut : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.close} onClick={handleClose} aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* ── Carousel (250px, image to edges) ────────────────────────────── */}
        <div className={styles.carousel}>
          <div className={styles.mainPhoto}>
            {currentPhoto ? (
              <div
                key={activeIdx}
                className={styles.mainPhotoImg}
                style={{ backgroundImage: `url(${currentPhoto})` }}
              />
            ) : (
              <div className={styles.mainPhotoPlaceholder} style={{ background: show.palette }} />
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

                {/* Thumbnails overlay at bottom of carousel */}
                <div className={styles.thumbStrip}>
                  {hasMoreLeft && (
                    <button
                      className={styles.thumbNav}
                      onClick={() => setThumbStart(s => Math.max(0, s - 1))}
                      aria-label="Назад"
                    >‹</button>
                  )}
                  {Array.from({ length: VISIBLE_THUMBS }).map((_, relIdx) => {
                    const idx   = thumbStart + relIdx;
                    const photo = allPhotos[idx];
                    if (!photo) return null;
                    const isActive = idx === activeIdx;
                    const showMore = relIdx === VISIBLE_THUMBS - 1 && hasMoreRight;
                    return (
                      <div
                        key={idx}
                        className={`${styles.thumb} ${isActive ? styles.thumbActive : ''}`}
                        style={{ backgroundImage: `url(${photo})` }}
                        onClick={() => goTo(idx)}
                      >
                        {showMore && <div className={styles.thumbMore}>+{hiddenRight}</div>}
                      </div>
                    );
                  })}
                  {hasMoreRight && (
                    <button
                      className={styles.thumbNav}
                      onClick={() => setThumbStart(s => Math.min(s + 1, allPhotos.length - VISIBLE_THUMBS))}
                      aria-label="Вперёд"
                    >›</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Spine (34px, hidden on mobile) ──────────────────────────────── */}
        <div className={styles.spine} aria-hidden="true">
          <span>Сезон 2025 / 2026 · Théâtre Tête-à-Tête · Nice</span>
        </div>

        {/* ── Info ────────────────────────────────────────────────────────── */}
        <div className={styles.info}>
          <div className={styles.ageStamp}>{show.age}</div>

          <div className={styles.author}>{author}</div>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.divider} />

          <div className={styles.metaTable}>
            {([
              [t.showModal.labelDate,     `${show.day} ${monthLabel} ${show.year}`, false],
              [t.showModal.labelTime,     show.time,                                false],
              [t.showModal.labelDuration, duration,                                 false],
              [t.showModal.labelPrice,    price,                                    true],
            ] as [string, string, boolean][]).map(([label, value, isPrice]) => (
              <div key={label} className={styles.metaRow}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={`${styles.metaValue}${isPrice ? ` ${styles.metaValuePrice}` : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          <p className={`${styles.desc}${descExpanded ? ` ${styles.descExpanded}` : ''}`}>{desc}</p>
          {desc && desc.length > 200 && (
            <button className={styles.readMoreBtn} onClick={() => setDescExpanded(v => !v)}>
              {descExpanded ? t.showModal.readLess : t.showModal.readMore}
            </button>
          )}

          <div className={styles.bookRow}>
            <button
              className={`btn btn-primary ${styles.bookBtn}`}
              onClick={() => { handleClose(); onBook(show); }}
            >
              {t.showModal.book} →
            </button>
            {availableSeats > 0 && (
              <span className={styles.seatsLeft}>
                {lang === 'FR'
                  ? <>Reste <span className={styles.seatsCount}>{availableSeats}</span> places</>
                  : <>Осталось <span className={styles.seatsCount}>{availableSeats}</span> мест</>
                }
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
