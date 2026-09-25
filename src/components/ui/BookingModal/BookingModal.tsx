import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useAuth } from '../../../context/AuthContext';
import { useLang } from '../../../i18n/LangContext';
import { createBookingViaApi, subscribeToUserBookings, newIdempotencyKey } from '../../../services/bookingService';
import { fetchShowAvailability } from '../../../services/availabilityService';
import type { BookingApiError } from '../../../services/bookingService';
import { mapAuthError, isPopupClosedError, isEmailInUseError } from '../../../utils/authErrors';
import { formatPhoneInput, normalizePhone, isValidPhone, sanitizePhoneTyping } from '../../../utils/phone';
import { useEmailTypoGuard } from '../../../hooks/useEmailTypoGuard';
import { EmailTypoHint } from '../EmailTypoHint';
import { MAX_TICKETS_PER_BOOKING } from '../../../../shared/catalog/shows';
import { loyaltySummary } from '../../../services/loyaltyService';
import {
  isOnlinePaymentUiEnabled, paymentMethodsFor, defaultPaymentMethod, checkoutRedirectUrl, redirectToCheckout,
  checkoutErrorKey, needsFreshBookingAttempt,
} from '../../../utils/onlinePayment';
import {
  priceBasket, canAddTicket, canRemoveTicket, setLineQuantity, clampBasket, basketLinesFor,
  type BasketLine, type BasketTariff,
} from '../../../../shared/domain/ticketBasket';
import { ticketBreakdownLabel } from '../../../../shared/catalog/ticketTypes';
import type { TicketTypeId } from '../../../../shared/catalog/shows';
import type { Show } from '../../../types';
import type { Booking, PaymentMethod } from '../../../types/booking';
import { BookingFormStep } from './BookingFormStep';
import { BookingSuccessStep } from './BookingSuccessStep';
import { BookingAuthShowPanel } from './BookingAuthShowPanel';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show | null;
  onClose: () => void;
  /** Открыть кабинет на «Моих билетах» — там лежит QR для прохода. */
  onOpenTickets?: () => void;
}

type Step = 'auth' | 'form' | 'success';

export function BookingModal({ show, onClose, onOpenTickets }: Props) {
  const { lang, t } = useLang();
  const { user, userProfile, loading: authContextLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, saveProfile } = useAuth();

  const initialStep = (): Step => (user ? 'form' : 'auth');

  const [step,         setStep]         = useState<Step>(initialStep);
  const [authTab,      setAuthTab]      = useState<'signIn' | 'signUp'>('signIn');
  const [authName,     setAuthName]     = useState('');
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError,    setAuthError]    = useState('');
  const [authLoading,  setAuthLoading]  = useState(false);
  // Опечатка в домене почты (gnail.com) — только при регистрации: там адрес сохраняется.
  const emailTypo = useEmailTypoGuard(authEmail, setAuthEmail, authTab === 'signUp');

  // Корзина: количество по каждому тарифу — и спектакль, для которого она
  // собрана. Пустая — ещё не трогали, действует выбор по умолчанию (1 билет
  // первого тарифа). Привязка к спектаклю обязательна: при открытии формы
  // другого спектакля первый рендер идёт ДО эффекта сброса, и корзина с чужими
  // тарифами роняла расчёт цены — модалка не открывалась до перезагрузки.
  const [basket,           setBasketState]      = useState<{ showId: string | null; lines: BasketLine[] }>(
    { showId: null, lines: [] },
  );
  const onlineEnabled = useMemo(() => isOnlinePaymentUiEnabled(), []);
  const [payment,          setPayment]          = useState<PaymentMethod>(() => defaultPaymentMethod(onlineEnabled));
  const [phone,            setPhone]            = useState('');
  const [comment,          setComment]          = useState('');
  const [submitLoading,    setSubmitLoading]    = useState(false);
  const [submitError,      setSubmitError]      = useState('');
  // Бронь создана, браузер уходит на страницу оплаты Stripe: форма заблокирована
  // до самой навигации, чтобы второй клик не создал вторую попытку.
  const [redirecting,      setRedirecting]      = useState(false);
  const [phoneError,       setPhoneError]       = useState('');
  const [ticketCode,       setTicketCode]       = useState('');
  const [savedAmount,      setSavedAmount]      = useState(0);
  const [ticketEmailSent,  setTicketEmailSent]  = useState(true);
  const [copiedCode,       setCopiedCode]       = useState(false);
  // null = остаток мест неизвестен. Раньше здесь всегда было 0, из-за чего
  // интерфейс показывал постоянное «свободны все места зала».
  const [seatsLeft,        setSeatsLeft]        = useState<number | null>(null);

  const [userBookings, setUserBookings] = useState<Booking[]>([]);

  // Ключ идемпотентности одной попытки бронирования. Пересоздаётся эффектом
  // открытия модалки, поэтому следующая осознанная бронь — уже новая операция,
  // а повторы одной и той же отправки схлопываются на сервере.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

  // «Оплатить онлайн» — только при включённом флаге интерфейса. Принимает ли
  // оплату сервер, решает его собственный ONLINE_PAYMENT_ENABLED.
  const paymentMethods = useMemo(() => paymentMethodsFor(onlineEnabled), [onlineEnabled]);

  // Тарифы спектакля для расчёта корзины — та же формула, что у сервера
  // (shared/domain/ticketBasket.ts). Сервер всё равно пересчитает цену сам.
  const tariffs = useMemo<BasketTariff[]>(
    () => (show?.ticketTypes ?? []).map(tt => ({ id: tt.id, price: tt.price, seats: tt.seats ?? 1, available: tt.available })),
    [show],
  );
  const lines = useMemo<BasketLine[]>(
    () => basketLinesFor(tariffs, basket.showId === (show?.id ?? null) ? basket.lines : []),
    [basket, tariffs, show?.id],
  );
  const setBasket = (next: BasketLine[]) => setBasketState({ showId: show?.id ?? null, lines: next });
  // MAX_TICKETS_PER_BOOKING обязателен: сервер отклоняет запрос с большим
  // числом билетов. Остаток мест неизвестен — ограничиваем только лимитами,
  // авторитетную проверку вместимости делает сервер.
  const limits = useMemo(() => ({ maxTickets: MAX_TICKETS_PER_BOOKING, seatsLeft }), [seatsLeft]);

  const loyaltyAvailable = useMemo(
    () => loyaltySummary(userBookings).available,
    [userBookings],
  );
  // Скидка — на ОДИН билет брони (самый дорогой в корзине), как у сервера.
  const price = useMemo(() => priceBasket(tariffs, lines, loyaltyAvailable), [tariffs, lines, loyaltyAvailable]);
  const { baseAmount, discountAmount, totalAmount } = price;
  const soldOut = seatsLeft !== null && seatsLeft <= 0;

  // Realtime subscription — обновляет loyalty reward без refresh.
  // Запускается только пока модалка открыта (show != null), чистится при закрытии.
  useEffect(() => {
    if (!user || !show) return;
    return subscribeToUserBookings(user.uid, setUserBookings, () => {});
  }, [user?.uid, show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Остаток мест приходит с сервера — клиент не имеет права читать чужие брони.
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void fetchShowAvailability(show.id).then((remaining) => {
      if (!cancelled) setSeatsLeft(remaining);
    });
    return () => { cancelled = true; };
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Урезаем корзину, когда остаток известен и меньше выбранного.
  useEffect(() => {
    const clamped = clampBasket(tariffs, lines, limits);
    const same = clamped.length === lines.length
      && clamped.every(c => lines.some(l => l.type === c.type && l.quantity === c.quantity));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!same) setBasketState({ showId: show?.id ?? null, lines: clamped });
  }, [tariffs, lines, limits, show?.id]);

  useEffect(() => {
    // Переходим на форму сразу после авторизации, не дожидаясь следующего рендера
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user && step === 'auth') setStep('form');
  }, [user, step]);

  useEffect(() => {
    // Подставляем телефон из профиля в виде «+33 7 49 66 19 40» (хранится E.164)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userProfile?.phone) setPhone(formatPhoneInput(userProfile.phone));
  }, [userProfile]);

  useEffect(() => {
    // Сбрасываем все поля при открытии для нового спектакля
    if (!show) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setStep(user ? 'form' : 'auth');
    setBasketState({ showId: show.id, lines: [] }); setPayment(defaultPaymentMethod(onlineEnabled));
    setComment(''); setSubmitError(''); setPhoneError(''); setRedirecting(false);
    setAuthEmail(''); setAuthPassword(''); setAuthName(''); setAuthError('');
    /* eslint-enable react-hooks/set-state-in-effect */
    idempotencyKeyRef.current = newIdempotencyKey();
  }, [show?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Назад» из Stripe браузер может вернуть страницу из bfcache вместе с
  // состоянием «Переходим к оплате…». Бронь уже создана и ждёт оплату: не
  // отправляем форму заново (вторая бронь заняла бы места), а ведём в «Мои
  // билеты» — там у брони есть «Продолжить оплату».
  const redirectingRef = useRef(false);
  useEffect(() => { redirectingRef.current = redirecting; }, [redirecting]);
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !redirectingRef.current) return;
      setRedirecting(false);
      onOpenTickets?.();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [onOpenTickets]);

  useScrollLock(!!show);

  // Escape, начальный фокус, удержание фокуса и возврат его инициатору.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(!!show, onClose, modalRef);

  // Дополнительный non-passive listener прямо на оверлее — ловит события,
  // которые могли не всплыть из-за stopPropagation в дочерних элементах.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !show) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onMove  = (e: TouchEvent) => {
      const allowEl = (e.target as Element | null)
        ?.closest('[data-scroll-lock-allow]') as HTMLElement | null;
      if (!allowEl) { e.preventDefault(); return; }
      const dy       = (e.touches[0]?.clientY ?? 0) - startY;
      const atTop    = allowEl.scrollTop <= 0;
      const atBottom = allowEl.scrollTop >= allowEl.scrollHeight - allowEl.clientHeight - 1;
      if (dy > 0 && atTop)    { e.preventDefault(); return; }
      if (dy < 0 && atBottom) { e.preventDefault(); return; }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
    };
  }, [show]);

  if (!show) return null;

  async function handleGoogle() {
    setAuthLoading(true); setAuthError('');
    try { await signInWithGoogle(); }
    catch (e) {
      if (isPopupClosedError(e)) { setAuthLoading(false); return; }
      setAuthError(mapAuthError(e, t.auth.errors));
    } finally { setAuthLoading(false); }
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (emailTypo.blocksSubmit()) return;
    setAuthLoading(true); setAuthError('');
    try {
      if (authTab === 'signIn') await signInWithEmail(authEmail, authPassword);
      else                      await signUpWithEmail(authEmail, authPassword, authName);
    } catch (e) {
      // Email уже занят при регистрации → переключаем на вкладку входа (authEmail уже заполнен)
      if (authTab === 'signUp' && isEmailInUseError(e)) setAuthTab('signIn');
      setAuthError(mapAuthError(e, t.auth.errors));
    } finally { setAuthLoading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !show || authContextLoading || price.ticketsCount < 1) return;
    // Двойной Enter успевает пройти раньше, чем React перерисует disabled у кнопки.
    if (submitLoading) return;
    if (redirecting) return;
    // Клиентская проверка — только для быстрой обратной связи; отказать по-настоящему
    // может лишь сервер, который считает вместимость в транзакции.
    if (seatsLeft !== null && seatsLeft < price.seatsCount) {
      setSubmitError(seatsLeft <= 0 ? t.booking.soldOut : t.booking.notEnoughSeats(seatsLeft));
      return;
    }

    // Номер разбирает libphonenumber: «07…» и «0033…» — Франция, «+CC…» — любая
    // страна. Без кода страны и без ведущего 0 номер не угадываем — просим проверить.
    if (!isValidPhone(phone)) {
      setPhoneError(t.profile.phoneInvalid);
      return;
    }

    setSubmitLoading(true); setSubmitError(''); setPhoneError('');
    try {
      // idToken нужен до вызова API — если получить не удаётся, прерываем бронирование.
      const idToken = await user.getIdToken();

      // Сервер сам считает totalAmount, status, paymentStatus, ticketCode —
      // любые значения этих полей из клиента игнорируются.
      // Состав корзины: тарифы и количества. Цены сервер берёт из каталога.
      const result = await createBookingViaApi({
        showId:        show.id,
        items:         price.items.map(i => ({ ticketType: i.type, quantity: i.quantity })),
        ticketType:    price.items[0]!.type,
        ticketsCount:  price.ticketsCount,
        paymentMethod: payment,
        comment,
        phone:         normalizePhone(phone),
        lang,
      }, idToken, idempotencyKeyRef.current);

      // Онлайн-оплата: экран «бронь принята» не показываем — билета до оплаты
      // нет, письма тоже. Сразу уходим на страницу оплаты Stripe; оплату
      // подтвердит webhook, а не возврат на сайт.
      if (payment === 'online') {
        const url = checkoutRedirectUrl(result);
        if (url) {
          setRedirecting(true);
          redirectToCheckout(url);
          return;
        }
        if (result.checkoutState === 'paid' || result.checkoutState === 'processing') {
          // Повтор запроса после уже начатой оплаты: состояние — в «Моих билетах».
          onOpenTickets?.();
          return;
        }
        // Ссылки нет — оплату открыть нельзя. Ни «оплачено», ни «принято».
        // Ключ НЕ меняем: бронь жива, повтор вернёт её же вместе с сессией,
        // а не создаст вторую бронь на те же места.
        setSubmitError(t.payment.checkoutError);
        return;
      }

      // Письмо-билет с QR отправил сервер в том же запросе — браузер больше
      // ничего не шлёт: закрытая вкладка не оставит зрителя без билета.
      setTicketCode(result.ticketCode);
      setSavedAmount(result.totalAmount);
      // Старый ответ без поля считаем отправленным — так было до переноса писем на сервер.
      setTicketEmailSent(result.ticketEmail !== 'failed');
      setStep('success');

      // Синхронизируем телефон в профиль если он там пустой (не блокируем).
      // Бронь уже сохранена — сбой обновления профиля не должен её затронуть.
      if (phone && !userProfile?.phone) {
        saveProfile({ phone: normalizePhone(phone) }).catch(e => console.warn('[booking] phone sync to profile failed', e));
      }
    } catch (err) {
      const fe = err as { code?: string; message?: string; stack?: string };
      // Диагностика без персональных данных: uid, e-mail и телефон в консоль
      // браузера не пишем — их видно в devtools и они могут утечь в сторонние
      // логгеры и расширения. Для разбора инцидента хватает технических полей;
      // связать их с пользователем можно по коду ошибки и серверным логам.
      console.error('[BookingModal] createBooking failed', {
        errorCode:       fe?.code,
        errorMessage:    fe?.message,
        showId:          show?.id,
        ticketTypes:     price.items.map(i => i.type),
        ticketsCount:    price.ticketsCount,
        phoneValid:      isValidPhone(phone),
        paymentMethod:   payment,
        isAuthenticated: !!user,
        userDocPresent:  !!userProfile,
        hasProfilePhone: !!userProfile?.phone,
        seatsLeft,
      });

      // Сервер присылает машиночитаемую причину — показываем её вместо общего текста.
      const apiErr = err as BookingApiError;
      if (apiErr?.reason === 'capacity_exceeded') {
        const remaining = apiErr.remaining ?? 0;
        setSeatsLeft(remaining);
        setSubmitError(remaining <= 0 ? t.booking.soldOut : t.booking.notEnoughSeats(remaining));
      } else if (apiErr?.reason === 'show_started') {
        setSubmitError(t.booking.showAlreadyStarted);
      } else if (payment === 'online') {
        // Сессия не создалась или истекла — сервер уже освободил места.
        // Следующая попытка — новая бронь, а не повтор мёртвой.
        if (needsFreshBookingAttempt(apiErr?.reason)) idempotencyKeyRef.current = newIdempotencyKey();
        setSubmitError(t.payment[checkoutErrorKey(apiErr?.reason)]);
      } else {
        setSubmitError(t.booking.submitError);
      }
    } finally { setSubmitLoading(false); }
  }

  function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* clipboard not available */});
  }

  const userEmail   = user?.email ?? userProfile?.email ?? '';

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true">

        <button className={styles.closeBtn} onClick={onClose} aria-label={lang === 'FR' ? 'Fermer' : 'Закрыть'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Auth */}
        {step === 'auth' && (
          <div className={styles.authWrap} data-scroll-lock-allow="true">
            {/* Спектакль — не состояние входа: панель не зависит от вкладки, загрузки и ошибок. */}
            <BookingAuthShowPanel show={show} lang={lang} t={t} />

            <div className={styles.authBody}>
              <h3 className={styles.authTitle}>
                {lang === 'FR' ? 'Connectez-vous pour\nréserver un billet' : 'Войдите, чтобы\nзабронировать билет'}
              </h3>
              <p className={styles.authHint}>{t.booking.loginRequired}</p>

              <button className={styles.googleBtn} onClick={handleGoogle} disabled={authLoading}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <div className={styles.divider}><span>{t.auth.orDivider}</span></div>

              <div className={styles.authTabs}>
                <button
                  className={authTab === 'signIn' ? styles.authTabActive : ''}
                  onClick={() => { setAuthTab('signIn'); setAuthError(''); }}
                >{t.auth.signIn}</button>
                <button
                  className={authTab === 'signUp' ? styles.authTabActive : ''}
                  onClick={() => { setAuthTab('signUp'); setAuthError(''); }}
                >{t.auth.signUp}</button>
              </div>

              <form onSubmit={handleAuth} className={styles.authForm}>
                {authTab === 'signUp' && (
                  <input
                    className={styles.input}
                    type="text" value={authName} placeholder={t.auth.nameLabel}
                    aria-label={t.auth.nameLabel}
                    onChange={e => setAuthName(e.target.value)} required disabled={authLoading}
                    autoComplete="name"
                  />
                )}
                <input
                  className={styles.input}
                  type="email" value={authEmail} placeholder={t.auth.emailLabel}
                  aria-label={t.auth.emailLabel}
                  onChange={e => setAuthEmail(e.target.value)} required disabled={authLoading}
                  onBlur={emailTypo.onBlur}
                  autoComplete="email"
                />
                {emailTypo.visible && emailTypo.suggestion && (
                  <EmailTypoHint suggestion={emailTypo.suggestion} t={t.auth} onFix={emailTypo.fix} onKeep={emailTypo.keep} />
                )}
                <input
                  className={styles.input}
                  type="password" value={authPassword} placeholder={t.auth.passwordLabel}
                  aria-label={t.auth.passwordLabel}
                  onChange={e => setAuthPassword(e.target.value)} required disabled={authLoading}
                  autoComplete={authTab === 'signIn' ? 'current-password' : 'new-password'}
                />
                {authError && <p className={styles.error}>{authError}</p>}
                <button type="submit" className={styles.submitBtn} disabled={authLoading}>
                  {authLoading ? '…' : authTab === 'signIn' ? t.auth.signIn : t.auth.register}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Форма */}
        {step === 'form' && (
          <BookingFormStep
            show={show}
            lang={lang}
            t={t}
            quantities={Object.fromEntries(price.items.map(i => [i.type, i.quantity]))}
            ticketsCount={price.ticketsCount}
            canAdd={(type: TicketTypeId) => canAddTicket(tariffs, lines, type, limits)}
            canRemove={(type: TicketTypeId) => canRemoveTicket(lines, type)}
            onQuantityChange={(type: TicketTypeId, q: number) => setBasket(setLineQuantity(lines, type, q))}
            soldOut={soldOut}
            payment={payment}
            phone={phone}
            comment={comment}
            submitLoading={submitLoading}
            redirecting={redirecting}
            paymentMethods={paymentMethods}
            submitError={submitError}
            baseAmount={baseAmount}
            totalAmount={totalAmount}
            discountAmount={discountAmount}
            loyaltyAvailable={loyaltyAvailable}
            seatsLeft={seatsLeft}
            onPaymentChange={setPayment}
            onPhoneChange={v => { setPhone(sanitizePhoneTyping(v)); setPhoneError(''); }}
            onPhoneBlur={() => {
              // Уход из поля: приводим к «+33 7 49 66 19 40» и сразу говорим, если номер не разобран.
              setPhone(formatPhoneInput(phone));
              if (phone.trim() && !isValidPhone(phone)) setPhoneError(t.profile.phoneInvalid);
            }}
            phoneError={phoneError}
            onCommentChange={setComment}
            onSubmit={handleSubmit}
          />
        )}

        {/* Успех */}
        {step === 'success' && (
          <BookingSuccessStep
            show={show}
            lang={lang}
            t={t}
            composition={ticketBreakdownLabel(price.items, lang)}
            savedAmount={savedAmount}
            ticketEmailSent={ticketEmailSent}
            ticketCode={ticketCode}
            payment={payment}
            userEmail={userEmail}
            copiedCode={copiedCode}
            onCopyCode={() => copyToClipboard(ticketCode, setCopiedCode)}
            onOpenTickets={onOpenTickets}
            onClose={onClose}
          />
        )}

      </div>
    </div>
  );
}
