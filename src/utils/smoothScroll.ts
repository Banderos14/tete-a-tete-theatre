type EasingFn = (t: number) => number;

export interface ScrollOptions {
  duration?: number;
  offset?: number;
  easing?: EasingFn;
}

// Mobile: sinusoidal ease-in-out — peak velocity only 1.57× the average (vs 4× for
// quartic). The page scrolls at a nearly uniform, cinema-smooth pace with a gentle
// ramp at each end. No aggressive mid-scroll burst.
const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Desktop: cubic ease-in-out — symmetric, suits deliberate mouse-driven navigation.
const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Duration scales with scroll distance so adjacent sections feel snappy
// while a full-page jump gives a real "tour".
// sqrt curve biases mid-distances toward the longer end.
function calcDuration(distancePx: number, mobile: boolean): number {
  const vh = window.innerHeight;
  const t  = Math.sqrt(Math.min(Math.abs(distancePx) / vh / 5, 1));
  const [minMs, maxMs] = mobile ? [1300, 1800] : [900, 1700];
  return Math.round(minMs + t * (maxMs - minMs));
}

let activeCancelFn: (() => void) | null = null;

export function smoothScrollToElement(element: HTMLElement, options: ScrollOptions = {}): void {
  // Cancel any in-progress animation so scrolls don't stack
  activeCancelFn?.();
  activeCancelFn = null;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.innerWidth < 768;

  const offset  = options.offset ?? 80;
  const easing  = options.easing ?? (mobile ? easeInOutSine : easeInOutCubic);

  // All geometry is captured once here — nothing is read inside the RAF loop,
  // so there is no per-frame layout thrashing.
  const startY   = window.scrollY;
  const targetY  = Math.max(0, element.getBoundingClientRect().top + window.scrollY - offset);
  const distance = targetY - startY;

  if (prefersReduced || Math.abs(distance) < 1) {
    window.scrollTo({ top: targetY });
    return;
  }

  const duration = options.duration ?? calcDuration(distance, mobile);

  let startTime: number | null = null;
  let rafId = 0;
  let cancelled = false;

  function cleanup(): void {
    cancelAnimationFrame(rafId);
    window.removeEventListener('wheel',      onUserScroll, true);
    window.removeEventListener('touchstart', onUserScroll, true);
    activeCancelFn = null;
  }

  // Yields to the user immediately if they touch or wheel during animation.
  // Listeners are attached with a 1-frame delay so the touchstart from the
  // button tap that *started* this scroll cannot accidentally cancel it.
  function onUserScroll(): void {
    cancelled = true;
    cleanup();
  }

  activeCancelFn = onUserScroll;

  // Defer listener attachment by one RAF so the originating touch/click
  // event has fully propagated before we start listening for cancellation.
  requestAnimationFrame(() => {
    if (cancelled) return;
    window.addEventListener('wheel',      onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchstart', onUserScroll, { capture: true, passive: true });
  });

  // RAF loop — only arithmetic and one scrollTo per frame, no DOM reads.
  function step(timestamp: number): void {
    if (cancelled) return;
    if (startTime === null) startTime = timestamp;

    const elapsed  = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    window.scrollTo({ top: startY + distance * easing(progress) });

    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      cleanup();
    }
  }

  rafId = requestAnimationFrame(step);
}

export function scrollToSection(id: string, options?: ScrollOptions): void {
  const el = document.getElementById(id);
  if (el) smoothScrollToElement(el, options);
}
