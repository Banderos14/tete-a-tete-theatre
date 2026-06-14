import { useEffect } from 'react';

let touchStartY = 0;

function onDocTouchStart(e: TouchEvent): void {
  touchStartY = e.touches[0].clientY;
}

// Blocks touchmove everywhere inside a locked overlay EXCEPT [data-scroll-lock-allow]
// containers — and even there, prevents rubber-band at scroll boundaries.
//
// With touch-action:none on the overlay, iOS never commits to a pan gesture,
// so e.cancelable is always true and e.preventDefault() always works.
// The "-webkit-overflow-scrolling: touch" on each scroll container creates a
// native UIScrollView that scrolls independently of touch-action CSS.
function onDocTouchMove(e: TouchEvent): void {
  const target  = e.target as HTMLElement | null;
  const allowEl = target?.closest?.('[data-scroll-lock-allow]') as HTMLElement | null;

  if (!allowEl) {
    // Not inside an allowed scroll zone — kill it.
    if (e.cancelable) e.preventDefault();
    return;
  }

  // Inside an allowed scroll container: prevent rubber-band at boundaries.
  const deltaY   = e.touches[0].clientY - touchStartY;
  const atTop    = allowEl.scrollTop <= 0;
  const atBottom = allowEl.scrollTop >= allowEl.scrollHeight - allowEl.clientHeight - 1;

  if (deltaY > 0 && atTop)    { if (e.cancelable) e.preventDefault(); return; }
  if (deltaY < 0 && atBottom) { if (e.cancelable) e.preventDefault(); return; }
  // Mid-scroll: UIScrollView handles it natively — don't interfere.
}

/**
 * Blocks background scroll when a modal/drawer/overlay is open.
 *
 * Four layers of protection:
 *   1. body position:fixed + html/body overflow:hidden + overscroll-behavior:none
 *   2. touchmove preventDefault (capture phase) for anything NOT inside [data-scroll-lock-allow]
 *   3. Boundary-aware prevention inside [data-scroll-lock-allow] (stops rubber-band)
 *   4. The overlay CSS MUST use touch-action:none (not pan-y!) so iOS never commits
 *      to a pan gesture — keeping e.cancelable:true so e.preventDefault() always works.
 *      Scroll containers must use -webkit-overflow-scrolling:touch so UIScrollView
 *      handles their scroll natively, independent of the ancestor touch-action:none.
 */
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
    body.style.height            = '100%';
    body.style.overflow          = 'hidden';
    body.style.overscrollBehavior = 'none';
    html.style.overflow          = 'hidden';
    html.style.height            = '100%';
    html.style.overscrollBehavior = 'none';

    // capture:true — fires before any element handler, even if stopPropagation is called.
    document.addEventListener('touchstart', onDocTouchStart, { passive: true,  capture: true });
    document.addEventListener('touchmove',  onDocTouchMove,  { passive: false, capture: true });

    return () => {
      body.style.position           = '';
      body.style.top                = '';
      body.style.left               = '';
      body.style.right              = '';
      body.style.width              = '';
      body.style.height             = '';
      body.style.overflow           = '';
      body.style.overscrollBehavior = '';
      html.style.overflow           = '';
      html.style.height             = '';
      html.style.overscrollBehavior = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchstart', onDocTouchStart, { capture: true });
      document.removeEventListener('touchmove',  onDocTouchMove,  { capture: true });
    };
  }, [active]);
}
