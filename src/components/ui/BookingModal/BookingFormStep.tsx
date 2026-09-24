import type { FormEvent, ReactElement } from 'react';
import { IconBuildingBank, IconCreditCard, IconTransfer } from '@tabler/icons-react';
import type { Show } from '../../../types';
import type { TicketTypeId } from '../../../../shared/catalog/shows';
import type { PaymentMethod } from '../../../types/booking';
import { RECOMMENDED_PAYMENT_METHOD } from '../../../utils/onlinePayment';
import { MAX_COMMENT_LEN } from '../../../../shared/contracts/limits';
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
    months: Record<string, string>;
  };

  /** Количество по тарифам; тарифа нет в объекте — 0. */
  quantities: Partial<Record<TicketTypeId, number>>;
  /** Всего билетов в корзине. */
  ticketsCount: number;
  canAdd: (type: TicketTypeId) => boolean;
  canRemove: (type: TicketTypeId) => boolean;
  soldOut: boolean;
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
  // null = остаток мест неизвестен (сервер недоступен) — индикатор не показываем.
  seatsLeft: number | null;

  phoneError?: string;

  onQuantityChange: (type: TicketTypeId, quantity: number) => void;
  onPaymentChange: (pm: PaymentMethod) => void;
  onPhoneChange: (v: string) => void;
  onCommentChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}


export function BookingFormStep({
  show, lang, t,
  quantities, ticketsCount, canAdd, canRemove, soldOut,
  payment, phone, comment, paymentMethods, redirecting = false,
  submitLoading, submitError, phoneError,
  baseAmount, totalAmount, discountAmount, loyaltyAvailable, seatsLeft,
  onQuantityChange, onPaymentChange, onPhoneChange, onCommentChange,
  onSubmit,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
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
  const showYearNumber = Number(show.year);
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
          {soldOut && <p className={styles.soldOutHint}>{t.booking.soldOut}</p>}
          <div className={styles.ticketTypes}>
            {show.ticketTypes.map(tt => {
              const qty   = quantities[tt.id] ?? 0;
              const label = lang === 'FR' ? tt.labelFR : tt.label;
              return (
                // Строка тарифа — не «выбор из вариантов»: несколько тарифов
                // живут в корзине одновременно, главный элемент — количество.
                <div key={tt.id} className={`${styles.ticketTypeRow} ${qty > 0 ? styles.ticketTypeRowFilled : ''}`}>
                  <span className={styles.ttName}>{label}</span>
                  <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
                  <div className={styles.stepper} role="group" aria-label={label}>
                    <button type="button" className={styles.stepperBtn} aria-label={t.booking.removeTicket(label)}
                      onClick={() => onQuantityChange(tt.id, qty - 1)}
                      disabled={busy || !canRemove(tt.id)}>−</button>
                    <span className={styles.stepperValue} aria-live="polite">{qty}</span>
                    <button type="button" className={styles.stepperBtn} aria-label={t.booking.addTicket(label)}
                      onClick={() => onQuantityChange(tt.id, qty + 1)}
                      disabled={busy || soldOut || !canAdd(tt.id)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Итог корзины */}
        <div className={styles.section}>
          {/* Количество и итог — симметрично: одинаковые подписи, одинаковые значения. */}
          <div className={styles.basketSummary}>
            <div className={styles.summaryCol}>
              <span className={styles.summaryLabel}>{t.booking.quantity}</span>
              <span className={styles.summaryValue}>{t.booking.ticketsTotal(ticketsCount)}</span>
            </div>
            <div className={`${styles.summaryCol} ${styles.summaryColEnd}`}>
              <span className={styles.summaryLabel}>{t.booking.total}</span>
              <span className={styles.summaryValue}>{totalAmount}&nbsp;€</span>
            </div>
          </div>
        </div>

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
            onPaste={e => { e.preventDefault(); onPhoneChange(e.clipboardData.getData('text')); }}
            placeholder="+33 6 00 00 00 00"
            maxLength={20}
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

        <button type="submit" className={styles.submitBtn} disabled={busy || ticketsCount < 1 || soldOut} aria-busy={busy}>
          {submitLabel}
          {!busy && <span className={styles.submitArrow}>→</span>}
        </button>

      </div>
    </form>
  );
}
