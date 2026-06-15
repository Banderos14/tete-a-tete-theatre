type EasingFn = (t: number) => number;

export interface ScrollOptions {
  duration?: number;
  offset?: number;
  easing?: EasingFn;
}

// Mobile: синусоидальное замедление — плавный старт и финиш, без резкого ускорения в середине.
const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Desktop: кубическое — симметрично, хорошо работает для навигации мышью.
const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Длительность растёт со расстоянием: короткие прыжки — быстро, на всю страницу — плавно.
// sqrt сжимает диапазон к длинному концу для средних дистанций.
function calcDuration(distancePx: number, mobile: boolean): number {
  const vh = window.innerHeight;
  const t  = Math.sqrt(Math.min(Math.abs(distancePx) / vh / 5, 1));
  const [minMs, maxMs] = mobile ? [1300, 1800] : [900, 1700];
  return Math.round(minMs + t * (maxMs - minMs));
}

let activeCancelFn: (() => void) | null = null;

export function smoothScrollToElement(element: HTMLElement, options: ScrollOptions = {}): void {
  // Отменяем предыдущую анимацию, если она ещё идёт
  activeCancelFn?.();
  activeCancelFn = null;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.innerWidth < 768;

  const offset  = options.offset ?? 80;
  const easing  = options.easing ?? (mobile ? easeInOutSine : easeInOutCubic);

  // Вся геометрия фиксируется один раз — внутри RAF-цикла DOM не читаем.
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

  // Если пользователь крутит колёсико или тапает — сразу отдаём управление.
  // Слушатели вешаем через один RAF, чтобы тап, который запустил скролл, не отменил его сам себя.
  function onUserScroll(): void {
    cancelled = true;
    cleanup();
  }

  activeCancelFn = onUserScroll;

  requestAnimationFrame(() => {
    if (cancelled) return;
    window.addEventListener('wheel',      onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchstart', onUserScroll, { capture: true, passive: true });
  });

  // RAF-цикл: только арифметика и один scrollTo за кадр, DOM не читаем.
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
