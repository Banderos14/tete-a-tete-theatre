// Письмо-билет: «бронь принята» и «оплата получена» — один шаблон.
//
// Собирает его СЕРВЕР по документу брони (server/email/ticketEmail.service.ts).
// Главная задача письма — чтобы зритель, открыв его, сразу понял: это мой
// билет, этот QR я показываю на входе, входить на сайт не нужно. Поэтому QR —
// в центре письма, крупно, с инструкцией, а кабинет — лишь дополнительная кнопка.
//
// Без QR письмо тоже полезно: код брони, данные спектакля и кнопка кабинета
// остаются (сервер собирает письмо без QR, если картинку построить или
// доставить не удалось).

import { localizedShowTitle } from '../catalog/showTitle.js';
import { ticketTypeLabel } from '../catalog/ticketTypes.js';
import { getPaymentAccount, normalizeIban } from '../config/payment.js';
import { myTicketsUrl, publicTicketUrl } from '../domain/ticketCode.js';
import {
  escapeEmailHtml, localeDate, wrapHtml, infoTable, linkButton, noteBlock,
  THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE, THEATRE_MAPS, PAY_REF_PREFIX,
} from './layout.js';

/** Content-ID картинки QR во вложении письма. */
export const TICKET_QR_CID = 'ticket-qr';

/** booking — письмо после брони; paid — после подтверждения оплаты; resend — повторная отправка. */
export type TicketEmailKind = 'booking' | 'paid' | 'resend';

/** Поля брони, из которых собирается письмо. Всё берётся из Firestore, не из запроса. */
export interface TicketEmailBooking {
  userName:          string;
  showId?:           string;
  showTitle:         string;
  showDate:          string;
  showTime:          string;
  ticketsCount:      number;
  seatsCount?:       number;
  ticketType:        string;
  totalAmount:       number;
  originalAmount?:   number;
  loyaltyDiscountApplied?: boolean;
  loyaltyDiscountAmount?:  number;
  ticketCode:        string;
  status:            string;
  paymentMethod:     string;
  paymentStatus:     string;
  paymentAccountId?: string;
  paymentReference?: string;
  lang:              'RU' | 'FR';
}

export interface TicketEmailOptions {
  kind:     TicketEmailKind;
  /** Вставлять ли QR (cid:ticket-qr). false — письмо без картинки. */
  withQr:   boolean;
  siteBase?: string;
}

type PayState = 'paid' | 'venue' | 'transfer';

function payStateOf(b: TicketEmailBooking): PayState {
  if (b.paymentStatus === 'paid') return 'paid';
  if (b.paymentMethod === 'bank_transfer') return 'transfer';
  return 'venue';
}

const EN_INSTRUCTION = 'Show this QR code to the theatre staff at the entrance.';

function copy(lang: 'RU' | 'FR', kind: TicketEmailKind, pay: PayState, amount: number) {
  const ru = lang === 'RU';
  const header = kind === 'paid'
    ? (ru ? 'Оплата получена — ваш билет' : 'Paiement reçu — votre billet')
    : pay === 'transfer'
      ? (ru ? 'Бронь принята — ожидает оплаты' : 'Réservation reçue — en attente de paiement')
      : (ru ? 'Бронь подтверждена' : 'Réservation confirmée');

  const payValue = {
    paid:     ru ? 'Оплачено' : 'Payé',
    venue:    ru ? `Оплата на месте при входе: ${amount}&nbsp;€` : `Paiement sur place à l’entrée : ${amount}&nbsp;€`,
    transfer: ru ? 'Банковский перевод — ожидаем оплату' : 'Virement bancaire — en attente',
  }[pay];

  const afterQr = {
    paid:     ru ? 'Билет оплачен. Просто покажите QR-код на входе.'
                 : 'Votre billet est payé. Il suffit de présenter le QR code à l’entrée.',
    venue:    ru ? `Оплата — на входе: сотрудник отсканирует QR и примет ${amount}&nbsp;€.`
                 : `Le paiement se fait à l’entrée : le personnel scanne le QR code et encaisse ${amount}&nbsp;€.`,
    transfer: ru ? 'Это ваш билет. Он станет оплаченным, как только мы получим перевод, — отдельно ничего делать не нужно.'
                 : 'Ceci est votre billet. Il sera marqué comme payé dès réception du virement — rien d’autre à faire.',
  }[pay];

  return {
    header,
    payValue,
    afterQr,
    greeting:     (name: string) => ru ? `Здравствуйте, ${name}!` : `Bonjour ${name}&nbsp;!`,
    ticketLabel:  ru ? 'Ваш билет' : 'Votre billet',
    instruction:  ru ? 'Покажите этот QR-код сотруднику театра при входе.'
                     : 'Présentez ce QR code au personnel du théâtre à l’entrée.',
    noLogin:      ru ? 'Входить на сайт не нужно — это письмо и есть ваш билет.'
                     : 'Inutile de vous connecter : cet e-mail est votre billet.',
    noQr:         ru ? 'Если QR-код не отображается, нажмите «Открыть билет» ниже или назовите на входе код брони.'
                     : 'Si le QR code ne s’affiche pas, cliquez sur « Ouvrir le billet » ci-dessous ou donnez votre code de réservation à l’entrée.',
    codeLabel:    ru ? 'Код брони' : 'Code de réservation',
    // Главная кнопка — публичная страница билета: открывается в любом браузере
    // без входа. Кабинет — второстепенная ссылка, он по-прежнему требует входа.
    button:       ru ? 'Открыть билет' : 'Ouvrir le billet',
    buttonNote:   ru ? 'Откроется ваш QR-код — входить на сайт не нужно.'
                     : 'Votre QR code s’ouvre directement, sans connexion.',
    account:      ru ? 'Личный кабинет' : 'Espace personnel',
    accountNote:  ru ? 'там же билет в PDF' : 'billet PDF disponible',
    rows: {
      show:    ru ? 'Спектакль' : 'Spectacle',
      date:    ru ? 'Дата' : 'Date',
      time:    ru ? 'Время' : 'Heure',
      place:   ru ? 'Адрес' : 'Adresse',
      seats:   ru ? 'Мест' : 'Places',
      tickets: ru ? 'Билеты' : 'Billets',
      amount:  ru ? 'Сумма' : 'Montant',
      initial: ru ? 'Без скидки' : 'Montant initial',
      discount:ru ? 'Скидка лояльности −50% (1 билет)' : 'Remise fidélité −50 % (1 billet)',
      payment: ru ? 'Оплата' : 'Paiement',
    },
    transferTitle: ru ? 'Реквизиты для перевода' : 'Coordonnées bancaires',
    transferNote:  ru
      ? 'Переведите сумму в течение 24 часов, обязательно указав назначение платежа. Если ваш банк не принимает IBAN с пробелами, вставьте IBAN без пробелов.'
      : 'Effectuez le virement sous 24 heures en indiquant impérativement le libellé. Si votre banque n’accepte pas l’IBAN avec espaces, utilisez l’IBAN sans espaces.',
    transferLabels: ru
      ? { receiver: 'Получатель', bank: 'Банк', ibanCompact: 'IBAN без пробелов', card: 'Номер карты', ref: 'Назначение платежа' }
      : { receiver: 'Bénéficiaire', bank: 'Banque', ibanCompact: 'IBAN sans espaces', card: 'Numéro de carte', ref: 'Libellé du virement' },
  };
}

/** Центральный блок письма: крупный QR и что с ним делать. */
function ticketBlock(c: ReturnType<typeof copy>, code: string, withQr: boolean): string {
  const qr = withQr
    ? `<img src="cid:${TICKET_QR_CID}" width="240" height="240" alt="QR ${code}"
            style="display:block;margin:0 auto;width:240px;height:240px;border:0;">`
    : '';
  return `
  <div style="border:2px solid #111111;border-radius:8px;padding:22px 20px;margin:0 0 20px;text-align:center;">
    <p style="margin:0 0 14px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#111;
              font-family:Arial,sans-serif;font-weight:700;">${c.ticketLabel}</p>
    ${qr}
    <p style="margin:14px 0 4px;font-size:22px;letter-spacing:4px;font-weight:700;color:#222;
              font-family:'Courier New',monospace;">${code}</p>
    <p style="margin:0 0 12px;font-size:11px;color:#999;letter-spacing:2px;text-transform:uppercase;
              font-family:Arial,sans-serif;">${c.codeLabel}</p>
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#111;line-height:1.45;font-family:Arial,sans-serif;">
      ${c.instruction}</p>
    <p style="margin:0 0 6px;font-size:12px;color:#777;font-family:Arial,sans-serif;">${EN_INSTRUCTION}</p>
    <p style="margin:0;font-size:13px;color:#555;line-height:1.5;font-family:Arial,sans-serif;">
      ${withQr ? c.noLogin : c.noQr}</p>
  </div>`;
}

export function buildTicketEmail(
  b: TicketEmailBooking, opts: TicketEmailOptions,
): { subject: string; html: string; text: string } {
  const lang   = b.lang;
  const isRU   = lang === 'RU';
  const pay    = payStateOf(b);
  const c      = copy(lang, opts.kind, pay, b.totalAmount);
  const title  = localizedShowTitle(b, lang);
  const date   = localeDate(b.showDate, lang);
  const seats  = b.seatsCount && b.seatsCount > 0 ? b.seatsCount : b.ticketsCount;
  const code   = escapeEmailHtml(b.ticketCode);
  const tariff = ticketTypeLabel(b.ticketType, lang);
  const ticketUrl  = publicTicketUrl(b.ticketCode, opts.siteBase, lang);
  const accountUrl = myTicketsUrl(opts.siteBase);

  const subject = `${THEATRE_NAME} — ${c.header}: ${title}`;

  const amountRows: [string, string][] = b.loyaltyDiscountApplied && b.originalAmount
    ? [
        [c.rows.initial,  `${b.originalAmount}&nbsp;€`],
        [c.rows.discount, `−${b.loyaltyDiscountAmount ?? 0}&nbsp;€`],
        [c.rows.amount,   `${b.totalAmount}&nbsp;€`],
      ]
    : [[c.rows.amount, `${b.totalAmount}&nbsp;€`]];

  const rows: [string, string][] = [
    [c.rows.show,    escapeEmailHtml(title)],
    [c.rows.date,    escapeEmailHtml(date)],
    [c.rows.time,    escapeEmailHtml(b.showTime)],
    [c.rows.place,   `<a href="${THEATRE_MAPS}" style="color:#222;">${THEATRE_ADDRESS}</a>`],
    [c.rows.seats,   String(seats)],
    [c.rows.tickets, `${b.ticketsCount} × ${escapeEmailHtml(tariff)}`],
    ...amountRows,
    [c.rows.payment, c.payValue],
  ];

  // Реквизиты — только в письме о брони, пока перевод не получен.
  const account = pay === 'transfer' && opts.kind !== 'paid' ? getPaymentAccount(b.paymentAccountId) : null;
  const reference = b.paymentReference || `${PAY_REF_PREFIX}-${b.ticketCode}`;
  const L = c.transferLabels;
  const transferRows: [string, string][] = account
    ? [
        [L.receiver, account.receiverName],
        ...(account.bankName ? [[L.bank, account.bankName] as [string, string]] : []),
        ...(account.type === 'iban'
          ? [['IBAN', account.iban], [L.ibanCompact, normalizeIban(account.iban)], ['BIC / SWIFT', account.bic]] as [string, string][]
          : [[L.card, account.cardNumber]] as [string, string][]),
        [L.ref, `<strong>${escapeEmailHtml(reference)}</strong>`],
      ]
    : [];
  const transferHtml = account ? `
    <div style="background:#f0ede8;border-radius:4px;padding:16px 20px;margin:20px 0 0;">
      <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#999;font-family:Arial,sans-serif;">
        ${c.transferTitle}</p>
      ${infoTable(transferRows)}
      <p style="margin:0;font-size:12px;color:#777;line-height:1.5;font-family:Arial,sans-serif;">${c.transferNote}</p>
    </div>` : '';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#333;">${c.greeting(escapeEmailHtml(b.userName || ''))}</p>
    ${ticketBlock(c, code, opts.withQr)}
    ${noteBlock(c.afterQr)}
    <div style="height:16px;"></div>
    ${infoTable(rows)}
    ${transferHtml}
    ${linkButton(ticketUrl, c.button)}
    <p style="margin:8px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">${c.buttonNote}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">
      <a href="${accountUrl}" style="color:#555;">${c.account}</a> · ${c.accountNote}</p>`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, c.header, bodyHtml);

  const strip = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '');
  const text = [
    THEATRE_NAME,
    '',
    strip(c.header.toUpperCase()),
    '',
    `${strip(c.ticketLabel)}: ${b.ticketCode}`,
    strip(c.instruction),
    EN_INSTRUCTION,
    strip(c.afterQr),
    '',
    `${c.rows.show}: ${title}`,
    `${c.rows.date}: ${date} · ${b.showTime}`,
    `${c.rows.seats}: ${seats}`,
    `${c.rows.amount}: ${b.totalAmount} €`,
    `${c.rows.payment}: ${strip(c.payValue)}`,
    ...(account ? ['', `${L.ref}: ${reference}`, ...(account.type === 'iban' ? [`IBAN: ${account.iban}`, `BIC: ${account.bic}`] : [])] : []),
    '',
    `${c.button}: ${ticketUrl}`,
    `${c.account}: ${accountUrl}`,
    '',
    THEATRE_ADDRESS,
    `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}

/** Письмо об отмене брони администратором. */
export function buildCancellationEmail(b: TicketEmailBooking, siteBase?: string): { subject: string; html: string; text: string } {
  const isRU  = b.lang === 'RU';
  const title = localizedShowTitle(b, b.lang);
  const date  = localeDate(b.showDate, b.lang);
  const header = isRU ? 'Бронирование отменено' : 'Réservation annulée';
  const subject = `${THEATRE_NAME} — ${header}: ${title}`;
  const note = isRU
    ? 'Если это ошибка или у вас есть вопросы, напишите нам — мы поможем.'
    : 'S’il s’agit d’une erreur ou si vous avez des questions, écrivez-nous.';
  const rows: [string, string][] = isRU
    ? [['Спектакль', escapeEmailHtml(title)], ['Дата', `${escapeEmailHtml(date)} · ${escapeEmailHtml(b.showTime)}`], ['Код брони', escapeEmailHtml(b.ticketCode)]]
    : [['Spectacle', escapeEmailHtml(title)], ['Date', `${escapeEmailHtml(date)} · ${escapeEmailHtml(b.showTime)}`], ['Code', escapeEmailHtml(b.ticketCode)]];
  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${isRU ? 'Здравствуйте' : 'Bonjour'}, ${escapeEmailHtml(b.userName || '')}!</p>
    ${infoTable(rows)}
    ${noteBlock(note)}
    ${linkButton(myTicketsUrl(siteBase), isRU ? 'Открыть мои билеты' : 'Ouvrir mes billets')}`;
  const text = [THEATRE_NAME, '', header, '', `${title} — ${date} · ${b.showTime}`, b.ticketCode, '', note].join('\n');
  return { subject, html: wrapHtml(isRU ? 'ru' : 'fr', subject, header, bodyHtml), text };
}
