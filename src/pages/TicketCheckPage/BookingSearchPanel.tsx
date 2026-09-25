// Поиск зрителя без QR: код брони, имя, e-mail или телефон.
//
// Сценарий входа: зритель не может открыть QR, потерял письмо, у него сел
// телефон. Поиск идёт по броням спектакля, выбранного наверху сканера, и находит
// бронь по тому, что зритель назовёт. Найденная бронь открывается тем же
// путём, что и скан QR, — через /api/admin-booking, одна проверка на всё.
//
// Брони спектакля читаются одним запросом (правила Firestore разрешают это
// роли admin), фильтр — локальный: десятки документов, без полнотекстового
// индекса и без лишних чтений на каждое нажатие клавиши.
//
// «Все спектакли» — для броней, которых нет среди выбранного: прошлые показы,
// спектакль, снятый с афиши (его нет в списке наверху), перенос на другой день.
// Схема старых броней та же (проверено по истории и данным), поэтому поиск
// общий. Открытая бронь идёт через ту же проверку на сервере: билет другого
// спектакля покажет «на другой спектакль» и не будет отмечен. Только чтение.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { getAllBookings } from '../../services/bookingService';
import { filterBookings } from '../../utils/bookingSearch';
import { normalizeTicketCodeInput } from '../../../shared/domain/ticketCode';
import type { Booking } from '../../types/booking';
import styles from './TicketCheckPage.module.scss';
import { formatPhoneForDisplay } from '../../utils/phoneDisplay';

const MAX_RESULTS = 30;

function payLabel(b: Booking): { text: string; className: string } {
  if (b.status === 'attended')                  return { text: 'Прошёл',            className: styles.stampGreen };
  if (b.status === 'cancelled' || b.paymentStatus === 'expired')
                                                return { text: 'Отменена',          className: styles.stampMuted };
  if (b.paymentStatus === 'paid')               return { text: 'Оплачено',          className: styles.stampGreen };
  if (b.paymentStatus === 'awaiting_transfer')  return { text: 'Ждём перевод',      className: styles.stampRed };
  return { text: `На месте ${b.totalAmount ?? 0} €`, className: styles.stampAmber };
}

export function BookingSearchPanel({ showId, onOpen }: {
  /** Спектакль, выбранный наверху сканера: ищем среди его броней. */
  showId: string;
  /** Открыть бронь по коду — тот же путь, что и скан QR. */
  onOpen: (ticketCode: string) => void;
}) {
  const [query, setQuery]       = useState('');
  const [allShows, setAllShows] = useState(false);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Брони выбранного сеанса. stale — ответ прежнего сеанса не затирает новый.
  useEffect(() => {
    if (!showId && !allShows) return;
    let stale = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookings(null);
    setLoadError('');
    getAllBookings(allShows ? {} : { showId })
      .then(list => { if (!stale) setBookings(list); })
      .catch(() => { if (!stale) setLoadError('Не удалось загрузить брони. Проверьте интернет и попробуйте снова.'); });
    return () => { stale = true; };
  }, [showId, allShows]);

  const results = useMemo(
    () => (bookings && query.trim() ? filterBookings(bookings, query).slice(0, MAX_RESULTS) : []),
    [bookings, query],
  );

  // Enter: полный код открывается сразу, даже если брони нет в этом сеансе —
  // сервер найдёт её по коду и сам скажет, на какой она вечер. Иначе — первое совпадение.
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeTicketCodeInput(query);
    if (code) { onOpen(code); return; }
    if (results.length === 1 && results[0]!.ticketCode) onOpen(results[0]!.ticketCode);
    else inputRef.current?.focus();
  }

  const exactCode = normalizeTicketCodeInput(query);

  return (
    <section className={styles.searchPanel} aria-label="Поиск брони без QR">
      <p className={styles.searchTitle}>Нет QR? Найдите бронь</p>

      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <label className={styles.searchInputWrap}>
          <IconSearch size={18} stroke={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Код брони, имя, e-mail или телефон"
            aria-label="Код брони, имя, e-mail или телефон"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
          />
        </label>
        <button type="submit" className={styles.searchSubmit} disabled={!query.trim()}>
          {exactCode ? 'Открыть' : 'Найти'}
        </button>
      </form>

      <label className={styles.searchScope}>
        <input type="checkbox" checked={allShows} onChange={e => setAllShows(e.target.checked)} />
        Искать во всех спектаклях, включая прошедшие
      </label>

      {loadError && <p className={styles.searchNote} role="alert">{loadError}</p>}
      {!loadError && bookings === null && showId && <p className={styles.searchNote}>Загружаем брони…</p>}
      {bookings && query.trim() && results.length === 0 && !exactCode && (
        <p className={styles.searchNote}>
          {allShows
            ? 'Ничего не найдено. Проверьте написание или введите код брони целиком.'
            : 'В этом спектакле ничего не найдено. Отметьте «Искать во всех спектаклях» или введите код брони целиком.'}
        </p>
      )}

      {results.length > 0 && (
        <ul className={styles.searchResults}>
          {results.map(b => {
            const pay = payLabel(b);
            const seats = b.seatsCount ?? b.ticketsCount;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={styles.searchResult}
                  // Бронь без кода (такие были до появления QR) открыть через сервер
                  // нельзя — её видно в списке, дальше — админка.
                  disabled={!b.ticketCode}
                  onClick={() => { if (b.ticketCode) onOpen(b.ticketCode); }}
                >
                  <span className={styles.searchResultName}>{b.userName || b.userEmail || 'Без имени'}</span>
                  <span className={styles.searchResultMeta}>
                    <span className={styles.mono}>{b.ticketCode || 'без кода'}</span> · {seats} мест · {formatPhoneForDisplay(b.userPhone) || b.userEmail}
                    {allShows && <> · {b.showTitle} · {b.showDate} {b.showTime}</>}
                  </span>
                  <span className={`${styles.stamp} ${pay.className}`}>{pay.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
