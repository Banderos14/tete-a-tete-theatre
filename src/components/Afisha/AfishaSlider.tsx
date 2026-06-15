import { useRef, useEffect, useCallback } from 'react';
import { useLang } from '../../i18n/LangContext';
import { SHOWS } from '../../data/shows';
import type { Show } from '../../types';
import styles from './AfishaSlider.module.scss';

// Preload show images after the browser is idle so we don't compete with
// the first paint / LCP. requestIdleCallback fires between frames on both
// desktop and mobile; the setTimeout fallback covers Safari < 16.4.
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
    // Preload first detail photo so ShowModal renders it instantly on open
    const firstPhoto = s.photos?.[0];
    if (firstPhoto) {
      const detail = new Image();
      detail.src = firstPhoto;
    }
  });
});

// 3 copies: left buffer | center (visible) | right buffer.
// Start offset = -singleWidth (center copy). Loop wraps at 0 and -2*singleWidth.
const COPIES = 3;
const CARDS  = Array.from({ length: COPIES }, () => SHOWS).flat();

const DRAG_THRESHOLD    = 6;    // px horizontal before gesture counts as drag (lower = more responsive)
const HORIZONTAL_BIAS   = 0.7;  // drag if absDx > absDy * BIAS — allows gestures up to ~55° from horizontal
const AUTO_SPEED        = 0.8;  // target px/frame for auto-scroll (≈48 px/s at 60 fps)
const LERP              = 0.08; // velocity blend per frame — 0.08 → iOS-like half-life ≈ 9 frames

interface Props {
  onCardClick: (show: Show) => void;
}

export function AfishaSlider({ onCardClick }: Props) {
  const { lang, t } = useLang();
  const total = SHOWS.length;

  const outerRef     = useRef<HTMLDivElement>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  const rafRef       = useRef<number>(0);
  const offsetRef    = useRef(0);
  // velocityRef drives all motion: negative = moving left (auto direction).
  // It lerps toward −AUTO_SPEED each frame, giving natural inertia decay.
  const velocityRef  = useRef(-AUTO_SPEED);
  // loopWidth cached once (scrollWidth / 2) so the RAF tick never reads DOM.
  const loopWidthRef = useRef(0);
  const isHoveredRef = useRef(false);

  const drag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startOffset: 0,
    isDragging: false,
    moved: false,
    // Velocity tracking for inertia (EMA of recent pointermove deltas)
    lastX: 0,
    lastTime: 0,
    velocity: 0, // px/ms, updated each pointermove
    show: null as Show | null,
  });

  // ── Offset application — translate3d forces GPU layer on iOS Safari ─────────
  // loopWidth (= singleCopyWidth) from ref: no DOM read inside the hot RAF path.
  // Valid range: (-2·lw, 0).  Copy 2 (center) is always at offset -lw.
  //   • too far left  (o ≤ -2·lw) → jump forward by lw
  //   • too far right (o ≥ 0)     → jump back   by lw
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

  // Cache singleCopyWidth = scrollWidth / COPIES; set initial offset to center copy.
  // ResizeObserver keeps the cached value fresh after viewport resize.
  // Initial offset is set once (when loopWidthRef is still 0) so RAF starts in the
  // center copy and doesn't need to correct itself on the very first tick.
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const single = trackRef.current.scrollWidth / COPIES;
      if (single <= 0) return;
      const firstMeasure = loopWidthRef.current === 0;
      loopWidthRef.current = single;
      if (firstMeasure) {
        const init = -single;               // center copy
        offsetRef.current = init;
        trackRef.current.style.transform = `translate3d(${init}px,0,0)`;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  // ── RAF tick ──────────────────────────────────────────────────────────────
  // Skipped only when:
  //   isDragging  – position is set directly by pointermove (position-based drag)
  //   isHovered   – desktop hover freezes the track
  // Otherwise: lerp velocityRef → −AUTO_SPEED each frame.
  // After drag release, velocityRef is seeded from drag velocity → free inertia.
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

  // ── Non-passive touchmove — stops page scroll during confirmed horizontal drag ──
  // React's onPointerMove is passive on some iOS versions; a direct listener is reliable.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current.isDragging) e.preventDefault();
    };
    outer.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => outer.removeEventListener('touchmove', onTouchMove);
  }, []);

  // ── Hover pause — desktop only ─────────────────────────────────────────────
  const onMouseEnter = useCallback(() => { isHoveredRef.current = true;  }, []);
  const onMouseLeave = useCallback(() => { isHoveredRef.current = false; }, []);

  // ── Pointer down ───────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('[data-show-idx]');
    const idx    = cardEl ? parseInt(cardEl.dataset.showIdx!, 10) : -1;

    drag.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offsetRef.current,
      isDragging: false,
      moved: false,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
      show: idx >= 0 ? CARDS[idx] : null,
    };

    // data-dragging (grabbing cursor) set only when drag is confirmed in onPointerMove.
    // No pause here — tick keeps running during taps (auto-scroll continues).
  }, []);

  // ── Pointer move ───────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;

    const dx    = e.clientX - d.startX;
    const dy    = e.clientY - d.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!d.moved && absDx + absDy > DRAG_THRESHOLD) d.moved = true;

    // Confirm horizontal drag: past threshold AND more horizontal than BIAS allows diagonals.
    // HORIZONTAL_BIAS = 0.7 → gesture up to ~55° from horizontal still counts as carousel drag.
    if (!d.isDragging && absDx > DRAG_THRESHOLD && absDx > absDy * HORIZONTAL_BIAS) {
      d.isDragging = true;
      outerRef.current?.setAttribute('data-dragging', '');
      try { outerRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    if (!d.isDragging) return;

    // Position-based drag: set offset directly (tick is suspended via isDragging check).
    applyOffset(d.startOffset + dx);

    // Track velocity via EMA for inertia on release.
    // Use a time window of 8–150 ms to filter noise and stale samples.
    const now = performance.now();
    const dt  = now - d.lastTime;
    if (dt > 8 && dt < 150) {
      const rawV = (e.clientX - d.lastX) / dt; // px/ms
      d.velocity = d.velocity * 0.6 + rawV * 0.4; // EMA α=0.4
    }
    d.lastX    = e.clientX;
    d.lastTime = now;
  }, [applyOffset]);

  // ── Pointer up ─────────────────────────────────────────────────────────────
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    outerRef.current?.removeAttribute('data-dragging');

    if (!d.moved && d.show) {
      // True tap — fire click. velocityRef is already at auto speed.
      onCardClick(d.show);
    } else if (d.isDragging) {
      // Seed inertia: convert drag velocity (px/ms) → px/frame at 60 fps.
      // Clamped to ±15 px/frame (≈900 px/s) to prevent extreme throws.
      const inertia = d.velocity * (1000 / 60);
      velocityRef.current = Math.max(-15, Math.min(15, inertia));
    }

    // CRITICAL: reset isDragging so the RAF tick resumes immediately.
    // Without this, tick checks !drag.current.isDragging → still true → carousel frozen.
    d.isDragging = false;
  }, [onCardClick]);

  // ── Pointer cancel (system interrupt: call, notification, etc.) ───────────
  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active    = false;
    d.isDragging = false; // let RAF resume
    outerRef.current?.removeAttribute('data-dragging');
    velocityRef.current = -AUTO_SPEED; // clean reset — no inertia on cancel
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
          {CARDS.map((show, i) => {
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
                    style={{ backgroundImage: `url(${show.image})` }}
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
