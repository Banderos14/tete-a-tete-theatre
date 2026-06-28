import { useEffect } from 'react';

let touchStartY = 0;

function onDocTouchStart(e: TouchEvent): void {
  touchStartY = e.touches[0].clientY;
}

// Блокирует touchmove везде, кроме [data-scroll-lock-allow] — и там же
// останавливает rubber-band на границах скролла.
// touch-action:none на оверлее держит e.cancelable:true, поэтому preventDefault всегда работает.
function onDocTouchMove(e: TouchEvent): void {
  const target  = e.target as HTMLElement | null;
  const allowEl = target?.closest?.('[data-scroll-lock-allow]') as HTMLElement | null;

  if (!allowEl) {
    if (e.cancelable) e.preventDefault();
    return;
  }

  // Предотвращаем rubber-band на границах разрешённого контейнера.
  const deltaY   = e.touches[0].clientY - touchStartY;
  const atTop    = allowEl.scrollTop <= 0;
  const atBottom = allowEl.scrollTop >= allowEl.scrollHeight - allowEl.clientHeight - 1;

  if (deltaY > 0 && atTop)    { if (e.cancelable) e.preventDefault(); return; }
  if (deltaY < 0 && atBottom) { if (e.cancelable) e.preventDefault(); return; }
  // Середина скролла — UIScrollView обрабатывает нативно.
}

// Блокирует фоновый скролл, пока открыта модалка/дравер.
// Оверлей ДОЛЖЕН иметь touch-action:none (не pan-y!), иначе iOS коммитит pan-жест
// и e.cancelable становится false — preventDefault не сработает.
// Скролл-контейнеры внутри используют -webkit-overflow-scrolling:touch для нативного UIScrollView.
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const body    = document.body;
    const html    = document.documentElement;

    body.style.position          = 'fixed';
    body.style.top               = `-${scrollY}px`;
    body.style.left              = '0';
    body.style.right             = '0';
    body.style.width             = '100%';
    // Не ограничиваем высоту: body остаётся высотой контента, что гарантирует
    // покрытие всего вьюпорта при position:fixed + top:-scrollY.
    // height:100% обрезало бы body до viewport-height и оставляло чёрную
    // полосу внизу (html-фон) размером scrollY пикселей.
    body.style.overflow          = 'hidden';
    body.style.overscrollBehavior = 'none';
    html.style.overflow          = 'hidden';
    html.style.overscrollBehavior = 'none';

    // capture:true — срабатывает раньше любого обработчика элемента, даже при stopPropagation.
    document.addEventListener('touchstart', onDocTouchStart, { passive: true,  capture: true });
    document.addEventListener('touchmove',  onDocTouchMove,  { passive: false, capture: true });

    return () => {
      body.style.position           = '';
      body.style.top                = '';
      body.style.left               = '';
      body.style.right              = '';
      body.style.width              = '';
      body.style.overflow           = '';
      body.style.overscrollBehavior = '';
      html.style.overflow           = '';
      html.style.overscrollBehavior = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchstart', onDocTouchStart, { capture: true });
      document.removeEventListener('touchmove',  onDocTouchMove,  { capture: true });
    };
  }, [active]);
}
