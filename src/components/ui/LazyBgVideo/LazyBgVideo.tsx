import { useEffect } from 'react';
import { useInView } from '../../../hooks/useInView';

interface Source {
  src: string;
  type: string;
}

interface Props {
  className: string;
  poster: string;
  sources: Source[];
  style?: React.CSSProperties;
}

// Фоновое автовоспроизводимое видео карточки. Источники монтируются только
// когда карточка реально попадает в viewport — на iPhone Safari одновременный
// autoplay у многих <video> на странице упирается в лимит аппаратных
// видео-декодеров, и часть карточек получает decode-ошибку вместо проигрывания.
// poster остаётся в DOM в любом случае — это нативный fallback браузера,
// его не нужно скрывать через onError.
export function LazyBgVideo({ className, poster, sources, style }: Props) {
  const { ref, isIntersecting, hasBeenInView } = useInView<HTMLVideoElement>('800px');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isIntersecting) el.play().catch(() => {});
    else el.pause();
  }, [isIntersecting, ref]);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      style={style}
      aria-hidden="true"
    >
      {hasBeenInView && sources.map(s => <source key={s.src} src={s.src} type={s.type} />)}
    </video>
  );
}
