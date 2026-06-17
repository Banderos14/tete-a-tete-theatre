import { useEffect, useState } from 'react';
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

// На мобильных (тот же breakpoint, что у styles/mixins.scss::mobile) скролл к карточке
// обычно быстрее, чем на desktop, поэтому даём IntersectionObserver больше запаса по высоте.
const ROOT_MARGIN =
  typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
    ? '1200px'
    : '800px';

// Фоновое автовоспроизводимое видео карточки. Источники монтируются только
// когда карточка реально попадает в viewport — на iPhone Safari одновременный
// autoplay у многих <video> на странице упирается в лимит аппаратных
// видео-декодеров, и часть карточек получает decode-ошибку вместо проигрывания.
//
// poster на <video preload="none"> в iOS Safari иногда не загружается заранее —
// Safari трактует preload="none" как сигнал отложить вообще любую загрузку, включая
// постер, до момента, пока видео не понадобится, и до того карточка рисует пустой
// чёрный прямоугольник вместо постера. Поэтому постер дублируется отдельным
// <img loading="eager">, лежащим ПОВЕРХ видео (выше по z-index): он не зависит от
// preload видео и гарантированно показывает кадр карточки. Скрываем его только
// после события "playing" — то есть когда видео реально показывает кадры, а не
// просто "может начать" — иначе на медленной сети возможен чёрный кадр между
// скрытием постера и первым отрисованным кадром видео.
export function LazyBgVideo({ className, poster, sources, style }: Props) {
  const { ref, isIntersecting, hasBeenInView } = useInView<HTMLVideoElement>(ROOT_MARGIN);
  const [videoPlaying, setVideoPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isIntersecting) el.play().catch(() => {});
    else el.pause();
  }, [isIntersecting, ref]);

  return (
    <>
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
        onPlaying={() => setVideoPlaying(true)}
      >
        {hasBeenInView && sources.map(s => <source key={s.src} src={s.src} type={s.type} />)}
      </video>
      {!videoPlaying && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className={className}
          style={{ ...style, zIndex: 1 }}
          loading="eager"
          decoding="async"
        />
      )}
    </>
  );
}
