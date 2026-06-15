import { useState, useRef, useEffect } from 'react';
import { useLang } from '../../i18n/LangContext';
import styles from './Marquee.module.scss';

export function Marquee() {
  const { t } = useLang();
  const content = t.marquee.join(' · ') + ' · ';

  const wrapRef    = useRef<HTMLDivElement>(null);
  const groupRef   = useRef<HTMLSpanElement>(null);
  const repeatsRef = useRef(3); // ref — читается в замыкании ResizeObserver без пересоздания
  const [repeats, setRepeats] = useState(3);

  useEffect(() => {
    const compute = () => {
      const wrap  = wrapRef.current;
      const group = groupRef.current;
      if (!wrap || !group) return;

      const containerW = wrap.offsetWidth;
      // Ширина одного повтора = offsetWidth группы ÷ текущий repeats
      const singleW = group.offsetWidth / repeatsRef.current;
      if (singleW <= 0 || containerW <= 0) return;

      // Нужно: repeats × singleW ≥ containerW.
      // +1 — запас для бесшовности (правый край не выходит за трек в конце анимации).
      const needed = Math.max(2, Math.ceil(containerW / singleW) + 1);
      if (needed !== repeatsRef.current) {
        repeatsRef.current = needed;
        setRepeats(needed);
      }
    };

    compute();
    const ro = new ResizeObserver(compute);
    if (wrapRef.current)  ro.observe(wrapRef.current);   // следим за шириной контейнера
    if (groupRef.current) ro.observe(groupRef.current);  // следим за шириной группы (после обновления)
    return () => ro.disconnect();
  }, [content]); // перезапуск при смене языка

  const text = content.repeat(repeats);

  return (
    <div className={styles.marquee} ref={wrapRef}>
      <div
        className={styles.track}
        style={{ '--marquee-repeats': String(repeats) } as React.CSSProperties}
      >
        <span className={styles.group} ref={groupRef}>{text}</span>
        <span className={styles.group} aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}
