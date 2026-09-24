import type { FormEvent, ReactElement } from 'react';
import { IconBuildingBank, IconCreditCard, IconTransfer } from '@tabler/icons-react';
import type { Show, TicketType } from '../../../types';
import type { PaymentMethod } from '../../../types/booking';
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
    };
    months: Record<string, string>;
  };

  tickets: number;
  /** Доступные способы оплаты: онлайн — только при включённом флаге интерфейса. */
  paymentMethods: PaymentMethod[];
  /** Бронь создана, идёт переход на страницу оплаты Stripe. */
  redirecting?: boolean;
  selectedTicket: TicketType | null;
  payment: PaymentMethod;
  phone: string;
  comment: string;
  submitLoading: boolean;
  submitError: string;

  activeTicket: TicketType | null;
  baseAmount: number;
  totalAmount: number;
  discountAmount: number;
  loyaltyAvailable: boolean;
  maxTickets: number;
  // null = остаток мест неизвестен (сервер недоступен) — индикатор не показываем.
  seatsLeft: number | null;

  phoneError?: string;

  onTicketsChange: (v: number) => void;
  onSelectedTicketChange: (tt: TicketType) => void;
  onPaymentChange: (pm: PaymentMethod) => void;
  onPhoneChange: (v: string) => void;
  onCommentChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}


export function BookingFormStep({
  show, lang, t,
  tickets, payment, phone, comment, paymentMethods, redirecting = false,
  submitLoading, submitError, phoneError,
  activeTicket, baseAmount, totalAmount, discountAmount, loyaltyAvailable, maxTickets, seatsLeft,
  onTicketsChange, onSelectedTicketChange, onPaymentChange, onPhoneChange, onCommentChange,
  onSubmit,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const monthLabel = t.months[show.month] ?? show.month;
  const seatsLeftLabel = lang === 'FR'
    ? `Places restantes : ${seatsLeft}`
    : `Свободно мест: ${seatsLeft}`;
  const soldOut = maxTickets <= 0;
  const busy    = submitLoading || redirecting;

  // Карточки способов оплаты. Онлайн — третьей, если флаг интерфейса включён;
  // при трёх способах карточки встают столбиком, иначе не помещаются в колонку.
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

        {/* Ticket types — карточки */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t.booking.ticketType}</div>
          <div className={styles.ticketTypes}>
            {show.ticketTypes.map(tt => (
              <button key={tt.id} type="button"
                className={`${styles.ticketTypeBtn} ${activeTicket?.id === tt.id ? styles.ticketTypeActive : ''}`}
                onClick={() => { onSelectedTicketChange(tt); onTicketsChange(1); }}>
                <span className={`${styles.ttRadio} ${activeTicket?.id === tt.id ? styles.ttRadioActive : ''}`} />
                <span className={styles.ttName}>{lang === 'FR' ? tt.labelFR : tt.label}</span>
                <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
              </button>
            ))}
          </div>
        </div>

        {/* Qty + total */}
        <div className={styles.section}>
          <div className={styles.sectionLabelRow}>
            <div className={styles.sectionLabel}>{t.booking.tickets}</div>
            {seatsLeft !== null && seatsLeft > 0 && (
              <span className={styles.seatsInline}>{seatsLeftLabel}</span>
            )}
          </div>
          {soldOut && <p className={styles.soldOutHint}>{t.booking.soldOut}</p>}
          <div className={styles.qtyRow}>
            <div className={styles.counter}>
              <button type="button" onClick={() => onTicketsChange(Math.max(1, tickets - 1))} disabled={tickets <= 1}>−</button>
              <span>{tickets}</span>
              <button type="button" onClick={() => onTicketsChange(Math.min(maxTickets, tickets + 1))} disabled={tickets >= maxTickets || soldOut}>+</button>
            </div>
            {activeTicket && (
              <div className={styles.totalBox}>
                <span className={styles.totalLabel}>{t.booking.total}</span>
                <span className={styles.totalAmount}>{totalAmount}&nbsp;€</span>
              </div>
            )}
          </div>
        </div>

        {/* Loyalty summary */}
          {activeTicket && loyaltyAvailable && (
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
                  <span className={`${styles.paymentDot} ${active ? styles.paymentDotActive : ''}`} aria-hidden="true" />
                  <span className={styles.paymentIcon} aria-hidden="true">{option.icon}</span>
                  <div>
                    <div className={styles.paymentName}>{option.name}</div>
                    <div className={styles.paymentDesc}>{option.desc}</div>
                  </div>
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

        <button type="submit" className={styles.submitBtn} disabled={busy || !activeTicket || soldOut} aria-busy={busy}>
          {submitLabel}
          {!busy && <span className={styles.submitArrow}>→</span>}
        </button>

      </div>
    </form>
  );
}
