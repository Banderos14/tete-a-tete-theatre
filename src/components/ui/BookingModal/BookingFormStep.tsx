import type { FormEvent } from 'react';
import { IconBuildingBank, IconTransfer } from '@tabler/icons-react';
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
  const showYearNumber = Number(show.year);
  const seasonLabel = Number.isFinite(showYearNumber)
    ? `СЕЗОН ${showYearNumber - 1} / ${showYearNumber} · THÉÂTRE TÊTE-À-TÊTE · NICE`
    : 'СЕЗОН · THÉÂTRE TÊTE-À-TÊTE · NICE';

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
          <div className={styles.showHeaderTop}>
            <span className={styles.showGlyph}>{show.glyph}</span>
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
                <span className={styles.ttName}>{ticketLabel(tt.id)}</span>
                <span className={styles.ttPrice}>{tt.price}&nbsp;€</span>
              </button>
            ))}
          </div>
        </div>

        {/* Qty + total */}
        <div className={styles.section}>
          <div className={styles.sectionLabelRow}>
            <div className={styles.sectionLabel}>{t.booking.tickets}</div>
            {availableSeats > 0 && (
              <span className={styles.seatsInline}>{t.booking.seatsAvailable(availableSeats, THEATRE_CAPACITY)}</span>
            )}
          </div>
          {availableSeats === 0 && <p className={styles.soldOutHint}>{t.booking.soldOut}</p>}
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
          <div className={styles.formRightAccentLine} />
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
              <span className={`${styles.paymentDot} ${payment === 'on_site' ? styles.paymentDotActive : ''}`} />
              <span className={styles.paymentIcon}><IconBuildingBank size={16} stroke={1.5} /></span>
              <div>
                <div className={styles.paymentName}>{t.booking.payOnSite}</div>
                <div className={styles.paymentDesc}>{t.booking.payOnSiteDesc}</div>
              </div>
            </button>
            <button type="button"
              className={`${styles.paymentCard} ${payment === 'bank_transfer' ? styles.paymentCardActive : ''}`}
              onClick={() => onPaymentChange('bank_transfer')}>
              <span className={`${styles.paymentDot} ${payment === 'bank_transfer' ? styles.paymentDotActive : ''}`} />
              <span className={styles.paymentIcon}><IconTransfer size={16} stroke={1.5} /></span>
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
