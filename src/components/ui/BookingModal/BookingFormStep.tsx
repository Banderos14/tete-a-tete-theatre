import { Fragment, type FormEvent, type ReactElement } from 'react';
import { IconBuildingBank, IconCreditCard, IconInfoCircle, IconTransfer } from '@tabler/icons-react';
import type { Show } from '../../../types';
import type { TicketTypeId } from '../../../../shared/catalog/shows';
import type { PaymentMethod } from '../../../types/booking';
import { RECOMMENDED_PAYMENT_METHOD } from '../../../utils/onlinePayment';
import { MAX_COMMENT_LEN } from '../../../../shared/contracts/limits';
import { TARIFF_GROUP_LABELS } from '../../../../shared/catalog/ticketTypes';
import { seasonStartYear } from '../../../data/shows';
import styles from './BookingModal.module.scss';

interface Props {
  show: Show;
  lang: 'RU' | 'FR';
  t: {
    booking: {
      ticketType: string;
      tickets: string;
      total: string;
      paymentMethod: string;
      payOnSite: string;
      payOnSiteDesc: string;
      payTransfer: string;
      payTransferDesc: string;
      payOnline: string;
      payOnlineDesc: string;
      submitOnline: string;
      comment: string;
      commentPlaceholder: string;
      submit: string;
      submitError: string;
      phone: string;
      loyaltyGift: string;
      loyaltyOriginal: string;
      loyaltyDiscount: string;
      loyaltyTotal: string;
      seatsAvailable: (n: number, total: number) => string;
      ticketsTotal: (n: number) => string;
      packagesTotal: (n: number) => string;
      seatsCount: (n: number) => string;
      giftsCount: (n: number) => string;
      packagePrice: string;
      loyaltyNotEligible: string;
      quantity: string;
      addTicket: (label: string) => string;
      removeTicket: (label: string) => string;
      soldOut: string;
      notEnoughSeats: (n: number) => string;
      showAlreadyStarted: string;
    };
    admin: {
      ticketStandard: string;
      ticketStudent: string;
    };
    payment: {
      redirecting: string;
      recommended: string;
    };
    sales: {
      unavailableCta: string;
      bookingPaused: string;
    };
    months: Record<string, string>;
  };

  /** Количество по тарифам; тарифа нет в объекте — 0. */
  quantities: Partial<Record<TicketTypeId, number>>;
  /** Всего билетов в корзине. */
  ticketsCount: number;
  canAdd: (type: TicketTypeId) => boolean;
  canRemove: (type: TicketTypeId) => boolean;
  soldOut: boolean;
  /** Продажи спектакля приостановлены ограниченным режимом (shared/catalog/salesMode.ts). */
  salesPaused?: boolean;
  /** Доступные способы оплаты: онлайн — только при включённом флаге интерфейса. */
  paymentMethods: PaymentMethod[];
  /** Бронь создана, идёт переход на страницу оплаты Stripe. */
  redirecting?: boolean;
  payment: PaymentMethod;
  phone: string;
  comment: string;
  submitLoading: boolean;
  submitError: string;

  baseAmount: number;
  totalAmount: number;
  discountAmount: number;
  loyaltyAvailable: boolean;
  /** У зрителя есть бонус, но на этот сеанс скидка лояльности не действует. */
  loyaltyNotEligible?: boolean;
  /** Мест в корзине (пакет «2 взрослых + ребёнок» — три места). */
  seatsCount?: number;
  /** Подарков в корзине; null — в корзине нет пакетов. */
  giftsCount?: number | null;
  // null = остаток мест неизвестен (сервер недоступен) — индикатор не показываем.
  seatsLeft: number | null;

  phoneError?: string;

  onQuantityChange: (type: TicketTypeId, quantity: number) => void;
  onPaymentChange: (pm: PaymentMethod) => void;
  onPhoneChange: (v: string) => void;
  onPhoneBlur: () => void;
  onCommentChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}


export function BookingFormStep({
  show, lang, t,
  quantities, ticketsCount, canAdd, canRemove, soldOut, salesPaused = false,
  payment, phone, comment, paymentMethods, redirecting = false,
  submitLoading, submitError, phoneError,
  baseAmount, totalAmount, discountAmount, loyaltyAvailable, seatsLeft,
  loyaltyNotEligible = false, seatsCount = ticketsCount, giftsCount = null,
  onQuantityChange, onPaymentChange, onPhoneChange, onPhoneBlur, onCommentChange,
  onSubmit,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const notice     = lang === 'FR' ? (show.noticeFR ?? show.notice) : show.notice;
  const hasPackages = show.ticketTypes.some(tt => typeof tt.gifts === 'number');
  const monthLabel = t.months[show.month] ?? show.month;
  const seatsLeftLabel = lang === 'FR'
    ? `Places restantes : ${seatsLeft}`
    : `Свободно мест: ${seatsLeft}`;
  const busy    = submitLoading || redirecting;

  // Карточки способов оплаты. Онлайн — первой и с бейджем «рекомендуем», если
  // флаг интерфейса включён; при трёх способах карточки встают столбиком,
  // иначе не помещаются в колонку.
  const paymentOptions: Record<PaymentMethod, { name: string; desc: string; icon: ReactElement }> = {
    on_site:       { name: t.booking.payOnSite,   desc: t.booking.payOnSiteDesc,   icon: <IconBuildingBank size={16} stroke={1.5} /> },
    bank_transfer: { name: t.booking.payTransfer, desc: t.booking.payTransferDesc, icon: <IconTransfer size={16} stroke={1.5} /> },
    online:        { name: t.booking.payOnline,   desc: t.booking.payOnlineDesc,   icon: <IconCreditCard size={16} stroke={1.5} /> },
  };
  const submitLabel = redirecting
    ? t.payment.redirecting
    : submitLoading ? '…' : payment === 'online' ? t.booking.submitOnline : t.booking.submit;
  // Начало сезона: январский сеанс 2027 года — всё ещё сезон 2026 / 2027.
  const showYearNumber = seasonStartYear(show) ?? Number.NaN;
  const seasonLabel = Number.isFinite(showYearNumber)
    ? (lang === 'FR'
        ? `SAISON ${showYearNumber} / ${showYearNumber + 1} · THÉÂTRE TÊTE-À-TÊTE · NICE`
        : `СЕЗОН ${showYearNumber} / ${showYearNumber + 1} · THÉÂTRE TÊTE-À-TÊTE · NICE`)
    : (lang === 'FR'
        ? 'SAISON · THÉÂTRE TÊTE-À-TÊTE · NICE'
        : 'СЕЗОН · THÉÂTRE TÊTE-À-TÊTE · NICE');

  return (
    <form onSubmit={onSubmit} className={styles.formLayout} data-scroll-lock-allow="true">

      {/* LEFT — 310px */}
      <div className={styles.formLeft}>

        {/* Show header */}
        <div
          className={styles.showHeader}
          style={{
            backgroundColor: show.palette,
            backgroundImage: show.image ? `url(${show.image})` : undefined,
          }}
        >
          <div className={styles.showHeaderTop}>
            <div className={styles.showHeaderInfo}>
              <p className={styles.showTitle}>{showTitle}</p>
              <p className={styles.showMeta}>{show.day} {monthLabel} {show.year} · {show.time}</p>
            </div>
          </div>
        </div>

        {/* Тарифы — у каждого своё количество: несколько тарифов в одной брони.
            Переключение между тарифами ничего не сбрасывает. */}
        <div className={styles.section}>
          <div className={styles.sectionLabelRow}>
            <div className={styles.sectionLabel}>{t.booking.ticketType}</div>
            {seatsLeft !== null && seatsLeft > 0 && (
              <span className={styles.seatsInline}>{seatsLeftLabel}</span>
            )}
          </div>
          {salesPaused
            ? <p className={styles.soldOutHint}>{t.sales.bookingPaused}</p>
            : soldOut && <p className={styles.soldOutHint}>{t.booking.soldOut}</p>}
          {notice && (
            <p className={styles.noticeHint}>
              <IconInfoCircle size={15} stroke={1.5} aria-hidden="true" />
              <span>{notice}</span>
            </p>
          )}
          <div className={styles.ticketTypes}>
            {show.ticketTypes.map((tt, idx) => {
              const qty   = quantities[tt.id] ?? 0;
              const label = lang === 'FR' ? tt.labelFR : tt.label;
              // Пакет: состав подписывается под названием — «3 места · 1 подарок».
              const hint  = typeof tt.gifts === 'number'
                ? `${t.booking.seatsCount(tt.seats)} · ${t.booking.giftsCount(tt.gifts)}`
                : tt.hint ? (lang === 'FR' ? (tt.hintFR ?? tt.hint) : tt.hint) : null;
              // Заголовок категории — перед первым пакетом группы.
              const group = tt.group && tt.group !== show.ticketTypes[idx - 1]?.group ? TARIFF_GROUP_LABELS[tt.group] : null;
              return (
                <Fragment key={tt.id}>
                {group && (
                  <div className={styles.tariffGroup}>
                    <span className={styles.tariffGroupName}>{lang === 'FR' ? group.FR : group.RU}</span>
                    <span className={styles.tariffGroupHint}>{lang === 'FR' ? group.hintFR : group.hintRU}</span>
                  </div>
                )}
                {/* Строка тарифа — не «выбор из вариантов»: несколько тарифов
                    живут в корзине одновременно, главный элемент — количество. */}
                <div className={`${styles.ticketTypeRow} ${qty > 0 ? styles.ticketTypeRowFilled : ''}`}>
                  <span className={styles.ttName}>
                    {label}
                    {hint && <span className={styles.ttHint}>{hint}</span>}
                  </span>
                  <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
                  <div className={styles.stepper} role="group" aria-label={label}>
                    <button type="button" className={styles.stepperBtn} aria-label={t.booking.removeTicket(label)}
                      onClick={() => onQuantityChange(tt.id, qty - 1)}
                      disabled={busy || !canRemove(tt.id)}>−</button>
                    <span className={styles.stepperValue} aria-live="polite">{qty}</span>
                    <button type="button" className={styles.stepperBtn} aria-label={t.booking.addTicket(label)}
                      onClick={() => onQuantityChange(tt.id, qty + 1)}
                      disabled={busy || soldOut || salesPaused || !canAdd(tt.id)}>+</button>
                  </div>
                </div>
                </Fragment>
              );
            })}
          </div>
          {hasPackages && <p className={styles.packageNote}>{t.booking.packagePrice}</p>}
        </div>

        {/* Итог корзины */}
        <div className={styles.section}>
          {/* Количество и итог — симметрично: одинаковые подписи, одинаковые значения. */}
          <div className={styles.basketSummary}>
            <div className={styles.summaryCol}>
              <span className={styles.summaryLabel}>{t.booking.quantity}</span>
              <span className={styles.summaryValue}>
                {hasPackages ? t.booking.packagesTotal(ticketsCount) : t.booking.ticketsTotal(ticketsCount)}
              </span>
              {/* Пакеты: сколько человек пройдёт и сколько подарков выдадут. */}
              {hasPackages && giftsCount !== null && (
                <span className={styles.summaryNote}>
                  {t.booking.seatsCount(seatsCount)} · {t.booking.giftsCount(giftsCount)}
                </span>
              )}
            </div>
            <div className={`${styles.summaryCol} ${styles.summaryColEnd}`}>
              <span className={styles.summaryLabel}>{t.booking.total}</span>
              <span className={styles.summaryValue}>{totalAmount}&nbsp;€</span>
            </div>
          </div>
        </div>

        {loyaltyNotEligible && ticketsCount > 0 && (
          <div className={styles.section}>
            <p className={styles.packageNote}>{t.booking.loyaltyNotEligible}</p>
          </div>
        )}

        {/* Loyalty summary */}
          {ticketsCount > 0 && loyaltyAvailable && (
            <div className={`${styles.section} ${styles.loyaltySection}`}>
              <div className={styles.loyaltyBlock}>
              <p className={styles.loyaltyTitle}>{t.booking.loyaltyGift}</p>
              <div className={styles.loyaltyRow}>
                <span>{t.booking.loyaltyOriginal}</span>
                <span className={styles.loyaltyStrike}>{baseAmount}&nbsp;€</span>
              </div>
              <div className={styles.loyaltyRow}>
                <span>{t.booking.loyaltyDiscount}</span>
                <span>−{discountAmount}&nbsp;€</span>
              </div>
              <div className={`${styles.loyaltyRow} ${styles.loyaltyRowTotal}`}>
                <span>{t.booking.loyaltyTotal}</span>
                <span>{totalAmount}&nbsp;€</span>
              </div>
            </div>
            </div>
          )}

      </div>

      <div className={styles.formSpine} aria-hidden="true">
        <span>{seasonLabel}</span>
      </div>

      {/* RIGHT */}
      <div className={styles.formRight}>

        {/* Заголовок правой колонки */}
        <div className={styles.formRightHeader}>
          <div className={styles.formRightLabel}>{lang === 'FR' ? 'RÉSERVATION' : 'БРОНИРОВАНИЕ'}</div>
          {/* NOTE: 'RÉSERVATION' / 'БРОНИРОВАНИЕ' is decorative header — intentionally uppercase */}
          <div className={styles.formRightAccentLine} />
        </div>

        {/* Phone */}
        <div className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="bk-phone">{t.booking.phone}</label>
          <input id="bk-phone" className={styles.input} type="tel" inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
            onBlur={onPhoneBlur}
            placeholder="06 12 34 56 78"
            aria-invalid={!!phoneError}
            maxLength={32}
            style={{ fontSize: '16px' }} />
          {phoneError && <p className={styles.error}>{phoneError}</p>}
        </div>

        {/* Payment — карточки */}
        <div className={styles.section}>
          <div className={styles.sectionLabel} id="bk-payment-label">{t.booking.paymentMethod}</div>
          <div
            className={`${styles.paymentCards} ${paymentMethods.length > 2 ? styles.paymentCardsStack : ''}`}
            role="group"
            aria-labelledby="bk-payment-label"
          >
            {paymentMethods.map(pm => {
              const option = paymentOptions[pm];
              const active = payment === pm;
              return (
                <button key={pm} type="button"
                  className={`${styles.paymentCard} ${active ? styles.paymentCardActive : ''}`}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => onPaymentChange(pm)}>
                  <span className={styles.paymentIcon} aria-hidden="true">{option.icon}</span>
                  <div className={styles.paymentBody}>
                    <div className={styles.paymentNameRow}>
                      <span className={styles.paymentName}>{option.name}</span>
                      {pm === RECOMMENDED_PAYMENT_METHOD && (
                        <span className={styles.paymentBadge}>{t.payment.recommended}</span>
                      )}
                    </div>
                    <div className={styles.paymentDesc}>{option.desc}</div>
                  </div>
                  {/* Точка — обычный элемент строки справа, без absolute и transform:
                      по центру карточки и на целых пикселях. */}
                  <span className={`${styles.paymentDot} ${active ? styles.paymentDotActive : ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Comment */}
        <div className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="bk-comment">{t.booking.comment}</label>
          {/* maxLength согласован с серверным MAX_COMMENT_LEN в api/create-booking.ts:
              сервер отклоняет более длинный текст, поэтому обрезаем заранее. */}
          <textarea id="bk-comment" className={styles.textarea}
            value={comment} onChange={e => onCommentChange(e.target.value.slice(0, MAX_COMMENT_LEN))}
            maxLength={MAX_COMMENT_LEN}
            placeholder={t.booking.commentPlaceholder} rows={3} />
        </div>

        {submitError && <p className={styles.error} role="alert">{submitError}</p>}

        <button type="submit" className={styles.submitBtn} disabled={busy || ticketsCount < 1 || soldOut || salesPaused} aria-busy={busy}>
          {salesPaused ? t.sales.unavailableCta : submitLabel}
          {!busy && !salesPaused && <span className={styles.submitArrow}>→</span>}
        </button>

      </div>
    </form>
  );
}
