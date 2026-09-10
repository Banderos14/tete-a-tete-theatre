import { useEffect, useRef } from 'react';

// Клавиатурная доступность модальных окон.
//
// Раньше AuthModal, BookingModal и ProfileDrawer не закрывались по Escape,
// не забирали фокус и не удерживали его: Tab уводил на фон под оверлеем,
// а после закрытия фокус не возвращался на кнопку, которая модалку открыла.
//
// Хук намеренно не трогает скролл — блокировкой занимается useScrollLock,
// и ломать её нельзя.
export function useModalA11y(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  // Элемент, у которого был фокус до открытия — туда его и вернём.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // onClose приходит новой функцией на каждый рендер родителя. Если положить её
  // в зависимости эффекта, эффект будет пересоздаваться при любом обновлении,
  // а его cleanup — каждый раз возвращать фокус наружу, и модалка фокус не удержит.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;

    // Список фокусируемых элементов считаем на каждое нажатие Tab:
    // содержимое модалок меняется (шаги бронирования, разделы кабинета).
    const focusables = (): HTMLElement[] => {
      if (!container) return [];
      return [...container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(el => el.offsetParent !== null || el === document.activeElement);
    };

    // Начальный фокус — на первый осмысленный элемент, иначе на сам контейнер.
    const focusTimer = window.setTimeout(() => {
      const items = focusables();
      if (items.length > 0) items[0]!.focus();
      else if (container) {
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const items = focusables();
      if (items.length === 0) return;

      const first = items[0]!;
      const last  = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      // Замыкаем обход: за последним элементом идёт первый и наоборот.
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      // Возвращаем фокус инициатору, если он ещё в документе.
      const target = previouslyFocused.current;
      if (target && document.contains(target)) target.focus();
    };
    // Зависимость только от open — см. комментарий про onCloseRef выше.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
