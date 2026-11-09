import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScrollLock } from '../../../../hooks/useScrollLock';
import { createPortal } from 'react-dom';
import { useLang } from '../../../../i18n/LangContext';
import type { Show, ShowPhoto } from '../../../../types';
import { IconInfoCircle } from '@tabler/icons-react';
import { fetchAllAvailability } from '../../../../services/availabilityService';
import { isShowPast, upcomingSessions, seasonStartYear } from '../../../../data/shows';
import { isShowSalesPaused } from '../../../../../shared/catalog/salesMode';
import { PosterPlaceholder } from '../PosterPlaceholder';
import { SessionPicker } from '../SessionPicker';
import styles from './ShowModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
  onBook: (show: Show) => void;
}

const VISIBLE_THUMBS = 3;

export function ShowModal({ show, onClose, onBook }: Props) {
  const { lang, t } = useLang();
  const [closing,      setClosing]      = useState(false);
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [thumbStart,   setThumbStart]   = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  // Остаток мест по id сеанса. null = остаток неизвестен (например, /api
  // недоступен) — тогда ничего не показываем, вместо выдуманного числа.
  const [seatsById,    setSeatsById]    = useState<Record<string, number> | null>(null);
  const [mountedAtMs] = useState(() => Date.now());
  // Выбранный сеанс постановки с несколькими показами (id записи каталога).
  const [sessionId,    setSessionId]    = useState<string | null>(null);

  // Производный стейт: сбрасываем при смене спектакля (render-time setState — паттерн из документации React)
  const [stateShowId, setStateShowId] = useState<string | null>(null);
  const currentId = show?.id ?? null;
  if (currentId !== stateShowId) {
    setStateShowId(currentId);
    setActiveIdx(0);
    setThumbStart(0);
    setDescExpanded(false);
    setSeatsById(null);
    setSessionId(currentId);
    if (currentId !== null) setClosing(false);
  }

  // Нормализуем photos: string → {src, position?}, добавляем imagePosition на главное фото
  const allPhotos = useMemo<ShowPhoto[]>(() => {
    if (!show) return [];
    if (show.photos?.length) {
      return show.photos.map(p =>
        typeof p === 'string' ? { src: p } : p
      );
    }
    if (show.image) return [{ src: show.image, position: show.imagePosition }];
    return [];
  }, [show]);

  // Остаток мест приходит с сервера: клиент не имеет права читать чужие брони.
  // Один запрос — остаток по каждому сеансу отдельно (места не суммируются).
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void fetchAllAvailability().then((all) => {
      if (!cancelled) setSeatsById(all);
    });
    return () => { cancelled = true; };
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Предстоящие сеансы постановки. У спектакля с одним показом — он сам (или
  // ничего, если прошёл): тогда выбора нет и модалка выглядит как раньше.
  const sessions = useMemo(
    () => (show ? upcomingSessions(show.productionId, mountedAtMs) : []),
    [show, mountedAtMs],
  );
  const hasSessionChoice = sessions.length > 1;
  // Сеанс, на который откроется форма брони. Пришли с конкретным сеансом
  // (ссылка ?show=<сеанс>) — он и выбран; прошедший сеанс заменяется ближайшим.
  const session: Show | null = !show ? null
    : hasSessionChoice ? (sessions.find(s => s.id === sessionId) ?? sessions[0]!) : show;
  const seatsLeft = session && seatsById ? (seatsById[session.id] ?? null) : null;

  const showIsPast = !!session && isShowPast(session, mountedAtMs);
  // Ограниченный режим продаж: спектакль виден, но купить его сейчас нельзя.
  const salesPaused = !!session && !showIsPast && isShowSalesPaused(session.id);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 150);
  }, [onClose]);

  const goTo = useCallback((idx: number) => {
    if (!allPhotos.length) return;
    const next = ((idx % allPhotos.length) + allPhotos.length) % allPhotos.length;
    setActiveIdx(next);
    setThumbStart(prev => {
      if (next < prev)                    return next;
      if (next >= prev + VISIBLE_THUMBS)  return Math.max(0, next - VISIBLE_THUMBS + 1);
      return prev;
    });
  }, [allPhotos.length]);

  // Разблокируем фон сразу при старте анимации закрытия — страница становится интерактивной
  // ещё во время 150мс анимации, без ожидания onClose.
  useScrollLock(!!show && !closing);

  // Клавиатура: ESC + стрелки
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     handleClose();
      if (e.key === 'ArrowRight') goTo(activeIdx + 1);
      if (e.key === 'ArrowLeft')  goTo(activeIdx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, handleClose, goTo, activeIdx]);

  if (!show || !session) return null;

  const hasMultiple  = allPhotos.length > 1;
  const hasMoreRight = thumbStart + VISIBLE_THUMBS < allPhotos.length;
  const hasMoreLeft  = thumbStart > 0;
  const hiddenRight  = Math.max(0, allPhotos.length - thumbStart - VISIBLE_THUMBS);
  const currentPhoto = allPhotos[activeIdx];
  const desc         = lang === 'FR' ? show.descFR           : show.desc;
  const title        = lang === 'FR' ? (show.titleFR    ?? show.title)    : show.title;
  const author       = lang === 'FR' ? (show.authorFR   ?? show.author)   : show.author;
  const duration     = lang === 'FR' ? (show.durationFR ?? show.duration) : show.duration;
  const price        = lang === 'FR' ? (show.priceFR    ?? show.price)    : show.price;
  const notice       = lang === 'FR' ? (show.noticeFR ?? show.notice) : show.notice;
  // Официальная афиша без галереи — показываем целиком и на мобиле.
  const contain      = show.imageFit === 'contain' && !show.photos?.length;
  const monthLabel   = t.months[session.month] ?? session.month;
  // Сезон — по началу сезона: январский сеанс 2027 года — это «2026 / 2027».
  const seasonYear   = seasonStartYear(session);
  const seasonYears  = seasonYear !== null ? `${seasonYear} / ${seasonYear + 1}` : session.year;

  return createPortal(
    <div
      className={`${styles.backdrop} ${closing ? styles.backdropOut : ''}`}
      onClick={handleClose}
    >
      <div
        className={`${styles.panel} ${closing ? styles.panelOut : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <button className={styles.close} onClick={handleClose} aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Карусель фото */}
        <div className={styles.carousel}>
          <div className={styles.mainPhoto}>
            {currentPhoto ? (
              <div key={activeIdx} className={styles.mainPhotoWrap}>
                <div
                  className={`${styles.photoBlur} ${contain ? styles.photoBlurVisible : ''}`}
                  style={{ backgroundImage: `url(${currentPhoto.src})` }}
                  aria-hidden="true"
                />
                <img
                  className={`${styles.photoImg} ${contain ? styles.photoImgContain : ''}`}
                  src={currentPhoto.src}
                  // Афиша без галереи — содержательная картинка (на ней даты и
                  // название); фото галереи — оформление, alt у них пустой.
                  alt={show.photos?.length ? '' : t.showModal.posterAlt(title)}
                  style={{
                    '--photo-mobile-position': currentPhoto.position ?? 'center center',
                    '--photo-mobile-scale': String(currentPhoto.mobileScale ?? 1),
                  } as React.CSSProperties}
                  draggable={false}
                  decoding="async"
                />
              </div>
            ) : (
              // Афиши ещё нет: нейтральная подложка с названием — та же, что в
              // Репертуаре. Чужую фотографию сюда не подставляем.
              <PosterPlaceholder palette={show.palette} title={title} />
            )}

            {hasMultiple && (
              <>
                <button
                  className={`${styles.navBtn} ${styles.navPrev}`}
                  onClick={() => goTo(activeIdx - 1)}
                  aria-label={lang === 'FR' ? 'Précédent' : 'Предыдущее'}
                >‹</button>
                <button
                  className={`${styles.navBtn} ${styles.navNext}`}
                  onClick={() => goTo(activeIdx + 1)}
                  aria-label={lang === 'FR' ? 'Suivant' : 'Следующее'}
                >›</button>

                {/* Thumbnails overlay at bottom of carousel */}
                <div className={styles.thumbStrip}>
                  {hasMoreLeft && (
                    <button
                      className={styles.thumbNav}
                      onClick={() => setThumbStart(s => Math.max(0, s - 1))}
                      aria-label={lang === 'FR' ? 'Précédent' : 'Назад'}
                    >‹</button>
                  )}
                  {Array.from({ length: VISIBLE_THUMBS }).map((_, relIdx) => {
                    const idx   = thumbStart + relIdx;
                    const photo = allPhotos[idx];
                    if (!photo) return null;
                    const isActive = idx === activeIdx;
                    const showMore = relIdx === VISIBLE_THUMBS - 1 && hasMoreRight;
                    return (
                      <div
                        key={idx}
                        className={`${styles.thumb} ${isActive ? styles.thumbActive : ''}`}
                        style={{ backgroundImage: `url(${photo.src})` }}
                        onClick={() => goTo(idx)}
                      >
                        {showMore && <div className={styles.thumbMore}>+{hiddenRight}</div>}
                      </div>
                    );
                  })}
                  {hasMoreRight && (
                    <button
                      className={styles.thumbNav}
                      onClick={() => setThumbStart(s => Math.min(s + 1, allPhotos.length - VISIBLE_THUMBS))}
                      aria-label={lang === 'FR' ? 'Suivant' : 'Вперёд'}
                    >›</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Корешок (скрыт на мобиле) */}
        <div className={styles.spine} aria-hidden="true">
          <span>{lang === 'FR' ? `Saison ${seasonYears} · Théâtre Tête-à-Tête · Nice` : `Сезон ${seasonYears} · Théâtre Tête-à-Tête · Nice`}</span>
        </div>

        {/* Информация о спектакле */}
        <div className={styles.info} data-scroll-lock-allow="true">
          {show.age && <div className={styles.ageStamp}>{show.age}</div>}

          <div className={styles.author}>{author}</div>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.divider} />

          <div className={styles.metaTable}>
            {([
              // Несколько сеансов — дата и время выбираются ниже, списком.
              ...(hasSessionChoice ? [] : [
                [t.showModal.labelDate, `${session.day} ${monthLabel} ${session.year}`, false],
                [t.showModal.labelTime, session.time,                                   false],
              ]),
              [t.showModal.labelDuration, duration,                                 false],
              [t.showModal.labelPrice,    price,                                    true],
            ] as [string, string, boolean][]).map(([label, value, isPrice]) => (
              <div key={label} className={styles.metaRow}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={`${styles.metaValue}${isPrice ? ` ${styles.metaValuePrice}` : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          {hasSessionChoice && (
            <SessionPicker
              sessions={sessions}
              selectedId={session.id}
              onSelect={setSessionId}
              seatsLeft={salesPaused ? null : seatsById}
              lang={lang}
              t={t}
            />
          )}

          {notice && (
            <p className={styles.notice}>
              <IconInfoCircle size={16} stroke={1.5} aria-hidden="true" />
              <span>{notice}</span>
            </p>
          )}

          <p className={`${styles.desc}${descExpanded ? ` ${styles.descExpanded}` : ''}`}>{desc}</p>
          {desc && desc.length > 200 && (
            <button className={styles.readMoreBtn} onClick={() => setDescExpanded(v => !v)}>
              {descExpanded ? t.showModal.readLess : t.showModal.readMore}
            </button>
          )}

          <div className={styles.bookRow}>
            {/* Прошедший спектакль забронировать нельзя — сервер такой запрос
                всё равно отклонит, так что кнопка не должна вести в тупик.
                Продажи приостановлены — та же логика: кнопка без действия
                и без «покупательского» hover, а рядом спокойный статус. */}
            {salesPaused ? (
              <>
                <button type="button" className={styles.pausedBtn} disabled aria-describedby="show-sales-paused">
                  {t.sales.unavailableCta}
                </button>
                <span id="show-sales-paused" className={styles.pausedStatus}>{t.sales.pausedStatus}</span>
              </>
            ) : showIsPast ? (
              // Тот же спокойный вид, что у «Временно недоступно»: красная
              // кнопка покупки, даже неактивная, выглядела кликабельной.
              <button type="button" className={styles.pausedBtn} disabled>
                {t.showModal.showPast}
              </button>
            ) : (
              <button
                className={`btn btn-primary ${styles.bookBtn}`}
                onClick={() => { handleClose(); onBook(session); }}
              >
                {t.showModal.book} →
              </button>
            )}
            {!salesPaused && seatsLeft !== null && seatsLeft > 0 && (
              <span className={styles.seatsLeft}>
                {lang === 'FR'
                  ? <>Reste <span className={styles.seatsCount}>{seatsLeft}</span> places</>
                  : <>Осталось <span className={styles.seatsCount}>{seatsLeft}</span> мест</>
                }
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
