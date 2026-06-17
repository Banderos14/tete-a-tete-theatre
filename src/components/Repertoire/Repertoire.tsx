import { useState, useEffect, useRef, useCallback } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { createPortal } from 'react-dom';
import { REPERTOIRE, SHOWS } from '../../data/shows';
import { useLang } from '../../i18n/LangContext';
import { PosterPlaceholder } from '../ui/PosterPlaceholder';
import { ShowModal } from '../ui/ShowModal';
import type { RepertoireItem, Show } from '../../types';
import { getShowIdFromLocation } from '../../utils/showUrl';
import styles from './Repertoire.module.scss';

// Постер спектакля: показываем фото если есть, иначе цветной плейсхолдер
function ShowPoster({
  image, imagePosition, palette, title, lazy = true,
}: {
  image?: string; imagePosition?: string; palette: string; title: string; lazy?: boolean;
}) {
  const [err, setErr] = useState(false);
  if (image && !err) {
    return (
      <>
        <img
          src={image}
          alt={title}
          loading={lazy ? 'lazy' : 'eager'}
          onError={() => { console.warn('[show image failed]', title, image); setErr(true); }}
          className={styles.posterImgEl}
          style={imagePosition ? { objectPosition: imagePosition } : undefined}
        />
        <div className={styles.posterImgOverlay} aria-hidden="true" />
      </>
    );
  }
  return <PosterPlaceholder palette={palette} title={title} kind="rep" />;
}

interface ModalProps {
  item: RepertoireItem;
  onClose: () => void;
  onBook: (show: Show) => void;
}

function RepertoireModal({ item, onClose, onBook }: ModalProps) {
  const { lang, t } = useLang();
  const desc     = lang === 'FR' ? (item.descriptionFR ?? item.description) : item.description;
  const title    = lang === 'FR' ? (item.titleFR    ?? item.title)    : item.title;
  const author   = lang === 'FR' ? (item.authorFR   ?? item.author)   : item.author;
  const duration = lang === 'FR' ? (item.durationFR ?? item.duration) : item.duration;

  const linkedShow = item.status === 'active'
    ? SHOWS.find(s => s.id === item.id) ?? null
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useScrollLock(true);

  return createPortal(
    <div
      className={styles.modalBackdrop}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modalPanel} role="dialog" aria-modal="true">
        <button className={styles.modalClose} onClick={onClose} aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}>✕</button>

        <div className={styles.modalPoster}>
          <ShowPoster image={item.image} imagePosition={item.imagePosition} palette={item.palette} title={title} lazy={false} />
        </div>

        <div className={styles.modalInfo}>
          <div className={styles.modalMeta}>
            <span className={styles.modalTag}>{t.showTags[item.tag] ?? item.tag}</span>
            <span className={styles.modalAge}>{item.age}</span>
          </div>

          <h3 className={styles.modalTitle}>{title}</h3>
          <div className={styles.modalAuthor}>{author}</div>

          {duration && (
            <div className={styles.modalDuration}>
              <span className={styles.modalDurationLabel}>{t.showModal.labelDuration}</span>
              <span>{duration}</span>
            </div>
          )}

          {desc && <p className={styles.modalDesc}>{desc}</p>}

          {linkedShow && (
            <button
              className={styles.modalBuyBtn}
              onClick={() => { onClose(); onBook(linkedShow); }}
              type="button"
            >
              <span>{t.showModal.book}</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  onBook: (show: Show) => void;
}

export function Repertoire({ onBook }: Props) {
  const { lang, t } = useLang();
  const [selected,      setSelected]      = useState<RepertoireItem | null>(null);
  const [deepLinkShow,  setDeepLinkShow]  = useState<Show | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [allForceVisible, setAllForceVisible] = useState(false);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleClose = useCallback(() => setSelected(null), []);

  // Скролл к спектаклю, подсветка и открытие модалки по ?show= в URL/HashRouter.
  useEffect(() => {
    const slug = getShowIdFromLocation();
    const linkedItem = slug ? REPERTOIRE.find(item => item.id === slug) : null;
    const linkedShow = slug ? SHOWS.find(show => show.id === slug) : null;
    if (!slug || !linkedItem) return;

    let handled = false;

    const doScroll = () => {
      if (handled) return;
      const el = cardRefs.current.get(slug);
      if (!el) return;
      handled = true;

      // Делаем все карточки видимыми через React, чтобы className не терял 'visible'
      setAllForceVisible(true);
      setHighlightedId(slug);
      if (linkedShow) setDeepLinkShow(linkedShow);
      setTimeout(() => setHighlightedId(null), 2000);

      // Небольшая задержка через rAF, чтобы React закоммитил visible-стейт перед скроллом
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    };

    const timer = window.setTimeout(doScroll, 0);
    window.addEventListener('theatre:intro-done', doScroll);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('theatre:intro-done', doScroll);
    };
  }, []);

  return (
    <section className={styles.repertoire} id="repertoire">
      <div className="section-head reveal">
        <div className="num">{t.repertoire.num}</div>
        <h2>{t.repertoire.title} <span className="it">{t.repertoire.titleIt}</span></h2>
        <div className="meta">{t.repertoire.metaShows(REPERTOIRE.length)}<br />{t.repertoire.metaSeason}</div>
      </div>

      <div className={styles.grid}>
        {REPERTOIRE.map((item) => {
          const cardTitle  = lang === 'FR' ? (item.titleFR  ?? item.title)  : item.title;
          const cardAuthor = lang === 'FR' ? (item.authorFR ?? item.author) : item.author;
          const cardTag    = t.showTags[item.tag] ?? item.tag;
          const linkedShow = item.status === 'active'
            ? SHOWS.find(s => s.id === item.id) ?? null
            : null;
          const linkedPrice = linkedShow
            ? (lang === 'FR' ? (linkedShow.priceFR ?? linkedShow.price) : linkedShow.price)
            : null;
          const linkedDate = linkedShow?.date ?? null;
          return (
          <button
            key={item.id}
            ref={el => {
              if (el) cardRefs.current.set(item.id, el);
              else cardRefs.current.delete(item.id);
            }}
            className={[
              styles.item,
              'reveal',
              allForceVisible ? 'visible' : '',
              highlightedId === item.id ? styles.highlighted : '',
              item.status === 'past' ? styles.pastItem : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setSelected(item)}
            type="button"
          >
            <div className={styles.poster}>
              <ShowPoster image={item.image} imagePosition={item.imagePosition} palette={item.palette} title={cardTitle} />
              <span className={[
                styles.mobilePosterAge,
                item.status !== 'active' ? styles.mobilePosterAgePast : '',
              ].filter(Boolean).join(' ')}>
                {item.age}
              </span>
            </div>
            <div className={styles.meta}>
              <span>{cardTag}</span>
              <span>{item.age}</span>
            </div>
            <div className={styles.title}>{cardTitle}</div>
            <div className={styles.author}>{cardAuthor}</div>

            {item.status === 'active' ? (
              <div className={styles.activeBadge}>{t.repertoire.statusActive}</div>
            ) : (
              <div className={styles.pastBadge}>{t.repertoire.statusPast}</div>
            )}

            <div className={styles.arrow}>
              {t.repertoire.more} <span className="arrow">→</span>
            </div>

            {/* мобильный блок — скрыт на десктопе */}
            <div className={styles.mobileInfo}>
              <div className={styles.mobileGenre}>{cardTag}</div>
              <div className={styles.mobileTitle}>{cardTitle}</div>
              <div className={styles.mobileFooter}>
                <span className={styles.mobileDate}>
                  {item.status === 'past'
                    ? t.repertoire.statusPast
                    : (linkedDate ?? (lang === 'FR' ? 'bientôt' : 'скоро'))}
                </span>
                {linkedPrice && (
                  <span className={styles.mobilePrice}>{linkedPrice}</span>
                )}
              </div>
            </div>
          </button>
          );
        })}
      </div>

      {selected && (
        <RepertoireModal item={selected} onClose={handleClose} onBook={onBook} />
      )}
      <ShowModal show={deepLinkShow} onClose={() => setDeepLinkShow(null)} onBook={onBook} />
    </section>
  );
}
