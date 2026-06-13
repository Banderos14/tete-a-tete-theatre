import { useEffect } from 'react';

let touchStartY = 0;

// Walk up the DOM from `el`; return true if a scrollable ancestor
// can actually scroll in the direction of the swipe (deltaY).
// deltaY > 0  → finger moved down → user wants to scroll UP  → need scrollTop > 0
// deltaY < 0  → finger moved up   → user wants to scroll DOWN → need scrollable content below
function canScrollInDirection(el: HTMLElement | null, deltaY: number): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(node);
    if (/auto|scroll/.test(overflow + overflowY)) {
      const atTop    = node.scrollTop <= 0;
      const atBottom = node.scrollTop >= node.scrollHeight - node.clientHeight - 1;
      if (deltaY > 0 && !atTop)    return true;
      if (deltaY < 0 && !atBottom) return true;
    }
    node = node.parentElement;
  }
  return false;
}

function onDocTouchStart(e: TouchEvent): void {
  touchStartY = e.touches[0].clientY;
}

// Prevent background scroll on iOS (rubber-band / scroll chaining).
// Allows touchmove only when an ancestor scrollable CAN scroll in swipe direction.
function onDocTouchMove(e: TouchEvent): void {
  if (!e.cancelable) return;
  const target = e.target as HTMLElement | null;
  const deltaY = e.touches[0].clientY - touchStartY;
  if (!canScrollInDirection(target, deltaY)) {
    e.preventDefault();
  }
}

/**
 * Blocks background scroll when a modal/drawer/overlay is open.
 * Covers three layers:
 *   1. position:fixed on body — prevents actual page scroll position change
 *   2. touchmove preventDefault with direction+boundary check — stops iOS rubber-band
 *   3. CSS overscroll-behavior:contain on modal containers (applied per component)
 * Restores exact scroll position on close — no page jumps.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const body = document.body;

    body.style.position = 'fixed';
    body.style.top      = `-${scrollY}px`;
    body.style.left     = '0';
    body.style.right    = '0';
    body.style.overflow = 'hidden';

    document.addEventListener('touchstart', onDocTouchStart, { passive: true });
    document.addEventListener('touchmove',  onDocTouchMove,  { passive: false });

    return () => {
      body.style.position = '';
      body.style.top      = '';
      body.style.left     = '';
      body.style.right    = '';
      body.style.overflow = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchstart', onDocTouchStart);
      document.removeEventListener('touchmove',  onDocTouchMove);
    };
  }, [active]);
}
