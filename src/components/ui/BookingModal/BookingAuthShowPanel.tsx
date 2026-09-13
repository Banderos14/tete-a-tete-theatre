// Левая панель шага входа: постер выбранного спектакля.
//
// Панель зависит только от спектакля и языка — не от вкладки входа, загрузки
// Google или ошибки. Поэтому переключение «Вход ↔ Регистрация» и ожидание
// авторизации её не перерисовывают и спектакль не теряется.
//
// Постер вписывается целиком (contain): у театральных афиш время, дата и лица
// стоят по краям, и cover их обрезал бы. Пустоту по бокам закрывает размытая
// копия ЭТОГО ЖЕ постера. Нет постера или он не загрузился — прежняя текстовая
// карточка на цвете спектакля.

import { useState, type CSSProperties } from 'react';
import type { Show } from '../../../types';
import type { T } from '../../../i18n/types';
import { buildAuthShowCard } from './authShowCard';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show;
  lang: 'RU' | 'FR';
  t: Pick<T, 'months' | 'booking'>;
}

export function BookingAuthShowPanel({ show, lang, t }: Props) {
  const card = buildAuthShowCard(show, lang, t);
  // Запоминаем, КАКОЙ адрес не загрузился: у другого спектакля попытка новая.
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const poster = card.poster && card.poster !== failedPoster ? card.poster : null;

  if (!poster) {
    return (
      <div className={styles.authShowStrip} style={{ background: show.palette }} data-show-id={show.id}>
        <div className={styles.authGlyph} style={{ background: show.palette }} />
        <div>
          <p className={styles.authShowTitle}>{card.title}</p>
          <p className={styles.authShowMeta}>{card.meta}</p>
        </div>
      </div>
    );
  }

  return (
    <figure className={`${styles.authShowStrip} ${styles.authPosterPanel}`} data-show-id={show.id}>
      <img className={styles.authPosterBackdrop} src={poster} alt="" aria-hidden="true" decoding="async" />
      <div className={styles.authPosterFrame}>
        <img
          className={styles.authPoster}
          src={poster}
          alt={card.posterAlt}
          decoding="async"
          // Кадрирование из каталога нужно только компактной мобильной карточке (cover);
          // на десктопе постер вписан целиком и сдвигать его незачем.
          style={card.posterPosition ? { '--poster-position': card.posterPosition } as CSSProperties : undefined}
          onError={() => setFailedPoster(poster)}
        />
      </div>
      <figcaption className={styles.authPosterCaption}>
        <span className={styles.authShowTitle}>{card.title}</span>
        <span className={styles.authShowMeta}>{card.meta}</span>
      </figcaption>
    </figure>
  );
}
