import type { FormEvent } from 'react';
import type { Show, TicketType } from '../../../types';
import type { PaymentMethod } from '../../../types/booking';
import { THEATRE_CAPACITY } from '../../../config/theatre';
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
    };
    admin: {
      ticketStandard: string;
      ticketStudent: string;
    };
    months: Record<string, string>;
  };

  tickets: number;
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
  availableSeats: number;

  onTicketsChange: (v: number) => void;
  onSelectedTicketChange: (tt: TicketType) => void;
  onPaymentChange: (pm: PaymentMethod) => void;
  onPhoneChange: (v: string) => void;
  onCommentChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

function BankIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M20 17H7M17 20l3-3-3-3M4 7h13M7 4L4 7l3 3" />
    </svg>
  );
}

export function BookingFormStep({
  show, lang, t,
  tickets, payment, phone, comment,
  submitLoading, submitError,
  activeTicket, baseAmount, totalAmount, discountAmount, loyaltyAvailable, maxTickets, availableSeats,
  onTicketsChange, onSelectedTicketChange, onPaymentChange, onPhoneChange, onCommentChange,
  onSubmit,
}: Props) {
  const showTitle  = lang === 'FR' ? (show.titleFR ?? show.title) : show.title;
  const monthLabel = t.months[show.month] ?? show.month;

  function ticketLabel(id: string | undefined) {
    return id === 'standard' ? t.admin.ticketStandard
         : id === 'student'  ? t.admin.ticketStudent
         : (id ?? '');
  }

  return (
    <form onSubmit={onSubmit} className={styles.formLayout}>

      {/* LEFT — 310px */}
      <div className={styles.formLeft}>

        {/* Show header с цветным фоном show.palette */}
        <div className={styles.showHeader} style={{ background: show.palette }}>
          <span className={styles.showGlyph}>{show.glyph}</span>
          <div>
            <p className={styles.showTitle}>{showTitle}</p>
            <p className={styles.showMeta}>{show.day} {monthLabel} {show.year} · {show.time}</p>
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
                <div className={styles.ttLeft}>
                  <span className={styles.ttName}>{ticketLabel(tt.id)}</span>
                </div>
                <div className={styles.ttDivider} />
                <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
              </button>
            ))}
          </div>
        </div>

        {/* Qty + total */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t.booking.tickets}</div>
          {availableSeats === 0
            ? <p className={styles.soldOutHint}>{t.booking.soldOut}</p>
            : <p className={styles.seatsHint}>{t.booking.seatsAvailable(availableSeats, THEATRE_CAPACITY)}</p>
          }
          <div className={styles.qtyRow}>
            <div className={styles.counter}>
              <button type="button" onClick={() => onTicketsChange(Math.max(1, tickets - 1))} disabled={tickets <= 1}>−</button>
              <span>{tickets}</span>
              <button type="button" onClick={() => onTicketsChange(Math.min(maxTickets, tickets + 1))} disabled={tickets >= maxTickets || availableSeats === 0}>+</button>
            </div>
            {activeTicket && (
              <div className={styles.totalBox}>
                <span className={styles.totalLabel}>{t.booking.total}</span>
                <span className={styles.totalAmount}>{totalAmount}&nbsp;€</span>
              </div>
            )}
          </div>
          {activeTicket && !loyaltyAvailable && (
            <p className={styles.priceHint}>{activeTicket.price}&nbsp;€ × {tickets} = {totalAmount}&nbsp;€</p>
          )}
          {activeTicket && loyaltyAvailable && (
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
          )}
        </div>

      </div>

      {/* RIGHT */}
      <div className={styles.formRight}>

        {/* Заголовок правой колонки */}
        <div className={styles.formRightHeader}>
          <div className={styles.formRightLabel}>{lang === 'FR' ? 'RÉSERVATION' : 'БРОНИРОВАНИЕ'}</div>
          <p className={styles.formRightShowTitle}>{showTitle}</p>
        </div>

        {/* Phone */}
        <div className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="bk-phone">{t.booking.phone}</label>
          <input id="bk-phone" className={styles.input} type="tel" inputMode="tel"
            value={phone} onChange={e => onPhoneChange(e.target.value)}
            placeholder="+33 6 00 00 00 00" />
        </div>

        {/* Payment — карточки */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>{t.booking.paymentMethod}</div>
          <div className={styles.paymentCards}>
            <button type="button"
              className={`${styles.paymentCard} ${payment === 'on_site' ? styles.paymentCardActive : ''}`}
              onClick={() => onPaymentChange('on_site')}>
              <span className={styles.paymentIcon}><BankIcon /></span>
              <div>
                <div className={styles.paymentName}>{t.booking.payOnSite}</div>
                <div className={styles.paymentDesc}>{t.booking.payOnSiteDesc}</div>
              </div>
            </button>
            <button type="button"
              className={`${styles.paymentCard} ${payment === 'bank_transfer' ? styles.paymentCardActive : ''}`}
              onClick={() => onPaymentChange('bank_transfer')}>
              <span className={styles.paymentIcon}><TransferIcon /></span>
              <div>
                <div className={styles.paymentName}>{t.booking.payTransfer}</div>
                <div className={styles.paymentDesc}>{t.booking.payTransferDesc}</div>
              </div>
            </button>
          </div>
        </div>

        {/* Comment */}
        <div className={styles.section}>
          <label className={styles.sectionLabel} htmlFor="bk-comment">{t.booking.comment}</label>
          <textarea id="bk-comment" className={styles.textarea}
            value={comment} onChange={e => onCommentChange(e.target.value)}
            placeholder={t.booking.commentPlaceholder} rows={3} />
        </div>

        {submitError && <p className={styles.error}>{submitError}</p>}

        <button type="submit" className={styles.submitBtn} disabled={submitLoading || !activeTicket || availableSeats === 0}>
          {submitLoading ? '…' : t.booking.submit}
          {!submitLoading && <span className={styles.submitArrow}>→</span>}
        </button>

      </div>
    </form>
  );
}
