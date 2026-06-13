import { useEffect } from 'react';

// Walk up the DOM from `el` to body; return true if any ancestor
// is a scrollable container with actual content to scroll.
function isInsideScrollable(el: HTMLElement | null): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const { overflow, overflowY, overflowX } = window.getComputedStyle(node);
    if (/auto|scroll/.test(overflow + overflowY + overflowX)) {
      const canScrollY = node.scrollHeight > node.clientHeight;
      const canScrollX = node.scrollWidth  > node.clientWidth;
      if (canScrollY || canScrollX) return true;
    }
    node = node.parentElement;
  }
  return false;
}

// Prevent document-level touchmove (iOS rubber-band) but allow
// touchmove inside elements that have their own scroll container.
function onDocTouchMove(e: TouchEvent): void {
  const target = e.target as HTMLElement | null;
  if (!isInsideScrollable(target)) {
    e.preventDefault();
  }
}

/**
 * Blocks background scroll when a modal/drawer/overlay is open.
 * Covers three layers:
 *   1. position:fixed on body — prevents actual page scroll position change
 *   2. touchmove preventDefault — stops iOS Safari rubber-band on backdrop/images
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

    document.addEventListener('touchmove', onDocTouchMove, { passive: false });

    return () => {
      body.style.position = '';
      body.style.top      = '';
      body.style.left     = '';
      body.style.right    = '';
      body.style.overflow = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchmove', onDocTouchMove);
    };
  }, [active]);
}
