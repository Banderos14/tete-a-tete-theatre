import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLang } from '../../i18n/LangContext';
import { SHOWS } from '../../data/shows';
import type { Show } from '../../types';
import styles from './AfishaSlider.module.scss';

// Предзагрузка постеров в idle — не конкурируем с LCP. setTimeout — фолбэк для Safari < 16.4.
const _schedulePreload = typeof requestIdleCallback === 'function'
  ? (fn: () => void) => requestIdleCallback(fn, { timeout: 2000 })
  : (fn: () => void) => setTimeout(fn, 200);

_schedulePreload(() => {
  SHOWS.forEach(s => {
    if (s.image) {
      const img = new Image();
      img.onerror = () => console.warn('[show image failed]', s.id, s.image);
      img.src = s.image;
    }
    const firstPhoto = s.photos?.[0];
    if (firstPhoto) {
      const detail = new Image();
      detail.src = typeof firstPhoto === 'string' ? firstPhoto : firstPhoto.src;
    }
  });
});

// Минимальное число копий набора карточек.
// Инвариант «нет чёрного поля»: copies ≥ ceil(viewport / singleWidth) + 2.
// При 3 спектаклях × ~340px = ~1020px на набор:
//   desktop 1920px → нужно ceil(1920/1020)+2 = 4 → MIN_COPIES=5 покрывает.
//   desktop 2560px → нужно 5, динамически увеличим до 6.
const MIN_COPIES = 5;

const DRAG_THRESHOLD  = 6;
const HORIZONTAL_BIAS = 0.7;
const AUTO_SPEED      = 0.8;
const LERP            = 0.08;

interface Props {
  onCardClick: (show: Show) => void;
}

export function AfishaSlider({ onCardClick }: Props) {
  const { lang, t } = useLang();
  const total = SHOWS.length;

  // Число копий растёт при первом измерении если viewport шире одного набора
  const [numCopies, setNumCopies] = useState(MIN_COPIES);
  const copiesRef   = useRef(MIN_COPIES);
  const cards = useMemo(
    () => Array.from({ length: numCopies }, () => SHOWS).flat(),
    [numCopies],
  );

  const outerRef     = useRef<HTMLDivElement>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const offsetRef    = useRef(0);
  const velocityRef  = useRef(-AUTO_SPEED);
  const loopWidthRef = useRef(0); // ширина одного набора (px); 0 = ещё не измерено
  const isHoveredRef = useRef(false);

  const drag = useRef({
    active:      false,
    pointerId:   -1,
    startX:      0,
    startY:      0,
    startOffset: 0,
    isDragging:  false,
    moved:       false,
    lastX:       0,
    lastTime:    0,
    velocity:    0,
    show:        null as Show | null,
  });

  // Диапазон offset: (-2·lw, 0).
  // При copies ≥ ceil(vw/lw)+2 правый край viewport никогда не выходит за трек.
  const applyOffset = useCallback((offset: number) => {
    const track = trackRef.current;
    if (!track) return;
    const lw = loopWidthRef.current;
    let o = offset;
    if (lw > 0) {
      while (o <= -lw * 2) o += lw;
      while (o >= 0)       o -= lw;
    }
    offsetRef.current = o;
    track.style.transform = `translate3d(${o}px,0,0)`;
  }, []);

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const outer = outerRef.current;
      if (!track || !outer) return;

      const copies = copiesRef.current;
      const singleW = track.scrollWidth / copies;
      if (singleW <= 0) return;

      const vw = outer.clientWidth;
      // +3 вместо +2 — дополнительный буфер для быстрого drag и resize
      const needed = Math.max(MIN_COPIES, Math.ceil(vw / singleW) + 3);

      if (needed > copies) {
        // Нужно больше копий → увеличиваем стейт; ResizeObserver перемерит после ре-рендера
        copiesRef.current = needed;
        setNumCopies(needed);
        return;
      }

      const firstMeasure = loopWidthRef.current === 0;
      loopWidthRef.current = singleW;

      if (firstMeasure) {
        // Стартуем со второй копии — слева и справа всегда есть буферные копии
        const init = -singleW;
        offsetRef.current = init;
        track.style.transform = `translate3d(${init}px,0,0)`;
      }
    };

    // Небольшая задержка на случай, если изображения ещё не дали layout
    const raf = requestAnimationFrame(() => {
      measure();
      setTimeout(measure, 120); // fallback после загрузки шрифтов / изображений
    });

    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    if (outerRef.current) ro.observe(outerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!drag.current.isDragging && !isHoveredRef.current) {
        velocityRef.current += (-AUTO_SPEED - velocityRef.current) * LERP;
        applyOffset(offsetRef.current + velocityRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [applyOffset]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current.isDragging) e.preventDefault();
    };
    outer.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => outer.removeEventListener('touchmove', onTouchMove);
  }, []);

  const onMouseEnter = useCallback(() => { isHoveredRef.current = true;  }, []);
  const onMouseLeave = useCallback(() => { isHoveredRef.current = false; }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('[data-show-idx]');
    const idx    = cardEl ? parseInt(cardEl.dataset.showIdx!, 10) : -1;

    drag.current = {
      active:      true,
      pointerId:   e.pointerId,
      startX:      e.clientX,
      startY:      e.clientY,
      startOffset: offsetRef.current,
      isDragging:  false,
      moved:       false,
      lastX:       e.clientX,
      lastTime:    performance.now(),
      velocity:    0,
      // idx — глобальный по всем копиям; модуль даёт индекс в SHOWS
      show: idx >= 0 ? SHOWS[((idx % total) + total) % total] : null,
    };
  }, [total]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;

    const dx    = e.clientX - d.startX;
    const dy    = e.clientY - d.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!d.moved && absDx + absDy > DRAG_THRESHOLD) d.moved = true;

    if (!d.isDragging && absDx > DRAG_THRESHOLD && absDx > absDy * HORIZONTAL_BIAS) {
      d.isDragging = true;
      outerRef.current?.setAttribute('data-dragging', '');
      try { outerRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    if (!d.isDragging) return;

    applyOffset(d.startOffset + dx);

    const now = performance.now();
    const dt  = now - d.lastTime;
    if (dt > 8 && dt < 150) {
      const rawV = (e.clientX - d.lastX) / dt;
      d.velocity = d.velocity * 0.6 + rawV * 0.4;
    }
    d.lastX    = e.clientX;
    d.lastTime = now;
  }, [applyOffset]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    outerRef.current?.removeAttribute('data-dragging');

    if (!d.moved && d.show) {
      onCardClick(d.show);
    } else if (d.isDragging) {
      const inertia = d.velocity * (1000 / 60);
      velocityRef.current = Math.max(-15, Math.min(15, inertia));
    }

    d.isDragging = false;
  }, [onCardClick]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active     = false;
    d.isDragging = false;
    outerRef.current?.removeAttribute('data-dragging');
    velocityRef.current = -AUTO_SPEED;
  }, []);

  return (
    <div className={`${styles.sliderWrap} reveal`}>
      <div
        ref={outerRef}
        className={styles.outer}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div ref={trackRef} className={styles.track}>
          {cards.map((show, i) => {
            const cardIndex = (i % total) + 1;
            const month  = t.months[show.month] ?? show.month;
            const title  = lang === 'FR' ? (show.titleFR  ?? show.title)  : show.title;
            const author = lang === 'FR' ? (show.authorFR ?? show.author) : show.author;

            return (
              <div
                key={i}
                className={styles.card}
                style={{ background: show.palette }}
                data-show-idx={String(i)}
                role="button"
                tabIndex={0}
                onKeyDown={ev => ev.key === 'Enter' && onCardClick(show)}
                aria-label={title}
              >
                {show.image && (
                  <div
                    className={styles.poster}
                    style={{
                      backgroundImage: `url(${show.image})`,
                      ...(show.imagePosition ? { backgroundPosition: show.imagePosition } : {}),
                    }}
                  />
                )}
                <div className={styles.overlay} />

                <div className={styles.body}>
                  <div className={styles.top}>
                    <span className={styles.counter}>
                      {String(cardIndex).padStart(2, '0')} / {String(total).padStart(2, '0')}
                    </span>
                    <span className={styles.age}>{show.age}</span>
                  </div>

                  <div className={styles.middle}>
                    <div className={styles.showTitle}>{title}</div>
                    <div className={styles.showAuthor}>{author}</div>
                  </div>

                  <div className={styles.bottom}>
                    <div className={styles.dateBlock}>
                      <span className={styles.day}>{show.day}</span>
                      <div className={styles.monthYear}>
                        <span className={styles.month}>{month}</span>
                        <span className={styles.time}>{show.time}</span>
                      </div>
                    </div>

                    <div className={styles.openHint}>
                      <span className={styles.hintText}>{t.repertoire.more}</span>
                      <span className={styles.hintArrow}>→</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
