import { useEffect, useRef, useState } from 'react';

// Отслеживает видимость элемента. once=true — флаг "был виден" не сбрасывается
// (используется, чтобы не пере-монтировать <source> у видео при повторном скролле).
export function useInView<T extends HTMLElement>(rootMargin = '800px') {
  const ref = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasBeenInView, setHasBeenInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting) setHasBeenInView(true);
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, isIntersecting, hasBeenInView };
}
