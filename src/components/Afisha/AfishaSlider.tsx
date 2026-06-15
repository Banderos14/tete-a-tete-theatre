import { useRef, useEffect, useCallback } from 'react';
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
    // Первое фото спектакля — предзагружаем, чтобы ShowModal открылся без мерцания
    const firstPhoto = s.photos?.[0];
    if (firstPhoto) {
      const detail = new Image();
      detail.src = firstPhoto;
    }
  });
});

// 3 копии: левый буфер | центр (видимый) | правый буфер.
// Начальное смещение = -singleWidth. Цикл оборачивается на 0 и -2·singleWidth.
const COPIES = 3;
const CARDS  = Array.from({ length: COPIES }, () => SHOWS).flat();

const DRAG_THRESHOLD    = 6;    // горизонтальный порог (px) для подтверждения drag
const HORIZONTAL_BIAS   = 0.7;  // absDx > absDy * BIAS → драг (до ~55° от горизонтали)
const AUTO_SPEED        = 0.8;  // целевая скорость авто-прокрутки (≈48 px/s при 60 fps)
const LERP              = 0.08; // смешение скорости за кадр — период полураспада ≈ 9 кадров

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
  // velocityRef управляет движением: отрицательное = влево (авто-направление).
  // Лерпится к −AUTO_SPEED каждый кадр, давая плавное затухание инерции.
  const velocityRef  = useRef(-AUTO_SPEED);
  // loopWidth кешируется один раз (scrollWidth / 2), чтобы RAF-тик не обращался к DOM.
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
    // Трекинг скорости для инерции (EMA дельт pointermove)
    lastX: 0,
    lastTime: 0,
    velocity: 0, // px/ms, updated each pointermove
    show: null as Show | null,
  });

  // translate3d переводит трек на GPU-слой iOS Safari, без DOM-чтений в RAF-пути.
  // Допустимый диапазон: (-2·lw, 0). Центральная копия всегда на offset = -lw.
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

  // Кешируем singleCopyWidth = scrollWidth / COPIES; ResizeObserver обновляет при ресайзе.
  // Начальное смещение ставим один раз (пока loopWidthRef == 0), чтобы RAF стартовал на центральной копии.
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

  // RAF-тик пропускается только при isDragging (позиция управляется pointermove)
  // и isHovered (десктоп). После отпускания drag velocityRef получает инерцию из скорости жеста.
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

  // Non-passive touchmove — блокирует скролл страницы при горизонтальном drag.
  // React's onPointerMove на некоторых iOS-версиях пассивный, прямой listener надёжнее.
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

    // data-dragging (курсор grabbing) выставляется только при подтверждённом drag в onPointerMove.
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;

    const dx    = e.clientX - d.startX;
    const dy    = e.clientY - d.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!d.moved && absDx + absDy > DRAG_THRESHOLD) d.moved = true;

    // Подтверждаем горизонтальный drag: прошли порог и движение более горизонтальное, чем BIAS.
    if (!d.isDragging && absDx > DRAG_THRESHOLD && absDx > absDy * HORIZONTAL_BIAS) {
      d.isDragging = true;
      outerRef.current?.setAttribute('data-dragging', '');
      try { outerRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    if (!d.isDragging) return;

    // Позиционный drag: offset ставим напрямую, тик suspended через isDragging.
    applyOffset(d.startOffset + dx);

    // EMA-скорость для инерции после отпускания (окно 8–150 мс фильтрует шум).
    const now = performance.now();
    const dt  = now - d.lastTime;
    if (dt > 8 && dt < 150) {
      const rawV = (e.clientX - d.lastX) / dt; // px/ms
      d.velocity = d.velocity * 0.6 + rawV * 0.4; // EMA α=0.4
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
      // Конвертируем скорость drag (px/ms) → px/кадр при 60 fps, ±15 px/кадр макс.
      const inertia = d.velocity * (1000 / 60);
      velocityRef.current = Math.max(-15, Math.min(15, inertia));
    }

    // Сбрасываем isDragging — иначе RAF-тик будет заморожен.
    d.isDragging = false;
  }, [onCardClick]);

  // Системное прерывание (звонок, уведомление) — чистый сброс без инерции.
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
