// Frontend email-сервис.
// Отправка происходит в Vercel Serverless Function /api/send-email.
// API-ключ (RESEND_API_KEY) во frontend никогда не попадает.
//
// Env-переменная (опционально):
//   VITE_EMAIL_ENDPOINT — по умолчанию "/api/send-email".
//                         Переопределяйте только при смене бэкенда или пути.
//
// Если endpoint недоступен — бронирование НЕ блокируется, email отправляется best-effort.

import type { BookingStatus } from '../types/booking';
import { PAYMENT_CONFIG, getPaymentAccount, normalizeIban } from '../config/payment';

const THEATRE_NAME    = PAYMENT_CONFIG.receiverName;
const THEATRE_ADDRESS = PAYMENT_CONFIG.address;
const THEATRE_EMAIL   = PAYMENT_CONFIG.paymentEmail;
const THEATRE_PHONE   = PAYMENT_CONFIG.paymentPhone;
const PAY_REF_PREFIX  = PAYMENT_CONFIG.paymentReferencePrefix;
const THEATRE_MAPS    = PAYMENT_CONFIG.googleMapsUrl;

export interface BookingEmailData {
  userEmail:        string;
  userName:         string;
  showTitle:        string;
  showTitleFR?:     string;
  showDate:         string;
  showTime:         string;
  ticketsCount:     number;
  ticketType:       string;
  totalAmount:      number;
  ticketCode:       string;
  paymentMethod:    'on_site' | 'bank_transfer';
  paymentAccountId?: string;
  lang:             'RU' | 'FR';
  originalAmount?:        number;
  loyaltyDiscountApplied?: boolean;
  loyaltyDiscountAmount?: number;
}

export interface BookingStatusEmailData {
  userEmail:    string;
  userName:     string;
  showTitle:    string;
  showDate:     string;
  showTime:     string;
  ticketsCount: number;
  totalAmount:  number;
  ticketCode:   string;
  newStatus:    Extract<BookingStatus, 'confirmed' | 'cancelled' | 'attended'>;
  lang:         'RU' | 'FR';
}

export interface PaymentPaidEmailData {
  userEmail:     string;
  userName:      string;
  showTitle:     string;
  showDate:      string;
  showTime:      string;
  ticketsCount:  number;
  totalAmount:   number;
  ticketCode:    string;
  bookingStatus: BookingStatus;
  lang:          'RU' | 'FR';
}

// showDate хранится как "17 Май 2026" — перевод месяца для FR-писем
const MONTHS_RU_TO_FR: Record<string, string> = {
  'Янв': 'Janvier', 'Фев': 'Février',  'Мар': 'Mars',      'Апр': 'Avril',
  'Май': 'Mai',      'Июн': 'Juin',     'Июл': 'Juillet',   'Авг': 'Août',
  'Сен': 'Septembre','Окт': 'Octobre',  'Ноя': 'Novembre',  'Дек': 'Décembre',
};

function localeDate(showDate: string, lang: 'RU' | 'FR'): string {
  if (lang === 'RU') return showDate;
  return showDate.replace(/[А-ЯЁ][а-яё]+/, m => MONTHS_RU_TO_FR[m] ?? m);
}

function wrapHtml(lang: string, subject: string, headerTitle: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:32px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:6px;overflow:hidden;max-width:540px;width:100%;
               box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Theatre header -->
        <tr>
          <td style="background:#111111;padding:26px 32px 22px;">
            <p style="margin:0 0 6px;color:#c9a96e;font-size:10px;
                      letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">
              ${THEATRE_NAME}
            </p>
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:400;line-height:1.3;">
              ${headerTitle}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 24px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;padding:18px 32px;border-top:1px solid #e8e8e8;">
            <p style="margin:0;font-size:11px;color:#999999;line-height:1.7;font-family:Arial,sans-serif;">
              ${THEATRE_NAME}<br>
              ${THEATRE_ADDRESS}<br>
              <a href="mailto:${THEATRE_EMAIL}" style="color:#c9a96e;text-decoration:none;">${THEATRE_EMAIL}</a>
              &nbsp;·&nbsp;${THEATRE_PHONE}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoTable(rows: [string, string][]): string {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:7px 16px 7px 0;color:#888;font-size:13px;
                 white-space:nowrap;vertical-align:top;font-family:Arial,sans-serif;">
        ${label}
      </td>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:#222;vertical-align:top;">
        ${value}
      </td>
    </tr>`).join('');

  return `<table cellpadding="0" cellspacing="0"
    style="width:100%;border-top:1px solid #eeeeee;margin-bottom:20px;">
    ${cells}
  </table>`;
}

function codeBlock(code: string, label: string): string {
  return `
  <div style="background:#f7f4ef;border-left:3px solid #c9a96e;
              padding:12px 16px;border-radius:4px;margin-bottom:20px;">
    <p style="margin:0 0 4px;font-size:11px;color:#999;
              letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">
      ${label}
    </p>
    <p style="margin:0;font-size:20px;letter-spacing:4px;font-weight:700;color:#222;
              font-family:'Courier New',monospace;">
      ${code}
    </p>
  </div>`;
}

function noteBlock(text: string): string {
  return `
  <div style="background:#f9f6f0;border-left:3px solid #c9a96e;
              padding:12px 16px;border-radius:4px;">
    <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${text}</p>
  </div>`;
}

function buildConfirmationEmail(data: BookingEmailData): { subject: string; html: string; text: string } {
  const isRU           = data.lang === 'RU';
  const isBankTransfer = data.paymentMethod === 'bank_transfer';
  const dateStr        = localeDate(data.showDate, data.lang);

  const subject = isRU
    ? `${THEATRE_NAME} — бронирование принято: ${data.showTitle}`
    : `${THEATRE_NAME} — réservation reçue : ${data.showTitle}`;

  const headerTitle = isRU ? 'Бронирование принято' : 'Réservation reçue';
  const greeting    = isRU
    ? `Здравствуйте, ${data.userName}!`
    : `Bonjour, ${data.userName}&nbsp;!<br><span style="font-size:13px;color:#888;">Merci pour votre réservation&nbsp;!</span>`;
  const ticketLabel = isRU ? 'Код брони' : 'Code de réservation';

  const payNote = isRU
    ? (isBankTransfer
        ? 'Для подтверждения бронирования переведите указанную сумму по реквизитам ниже. В назначении платежа обязательно укажите референс платежа. Ваша бронь будет подтверждена только после проверки банковского перевода.'
        : 'Оплата — наличными в кассе театра, перед спектаклем.')
    : (isBankTransfer
        ? 'Pour confirmer votre réservation, veuillez effectuer le virement bancaire avec les coordonnées ci-dessous. Indiquez obligatoirement la référence dans le libellé du virement. Votre réservation sera confirmée uniquement après vérification du virement bancaire.'
        : 'Le paiement s\'effectue en espèces à la caisse du théâtre avant le spectacle.');

  const hasDiscount = data.loyaltyDiscountApplied && data.originalAmount;
  const amountRows: [string, string][] = hasDiscount
    ? (isRU
        ? [
            ['Исходная сумма',      `${data.originalAmount}&nbsp;€`],
            ['Скидка лояльности −50%', `−${data.loyaltyDiscountAmount}&nbsp;€`],
            ['К оплате',           `${data.totalAmount}&nbsp;€`],
          ]
        : [
            ['Montant initial',       `${data.originalAmount}&nbsp;€`],
            ['Remise fidélité −50%',  `−${data.loyaltyDiscountAmount}&nbsp;€`],
            ['Total à payer',         `${data.totalAmount}&nbsp;€`],
          ])
    : (isRU
        ? [['Сумма', `${data.totalAmount}&nbsp;€`]]
        : [['Montant', `${data.totalAmount}&nbsp;€`]]);

  const rows: [string, string][] = isRU ? [
    ['Зритель',   data.userName],
    ['Спектакль', data.showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ['Билеты',    `${data.ticketsCount} шт.`],
    ...amountRows,
  ] : [
    ['Spectateur', data.userName],
    ['Spectacle',  data.showTitle],
    ['Date',       `${dateStr} · ${data.showTime}`],
    ['Billets',    `${data.ticketsCount} billet${data.ticketsCount > 1 ? 's' : ''}`],
    ...amountRows,
  ];

  // Реквизиты для банковского перевода — берём выбранный платёжный аккаунт
  const paymentReference = `${PAY_REF_PREFIX}-${data.ticketCode}`;
  const account = isBankTransfer ? getPaymentAccount(data.paymentAccountId) : null;

  const buildTransferRows = (): [string, string][] => {
    if (!account) return [];
    const rows: [string, string][] = [];
    if (isRU) {
      rows.push(['Получатель', account.receiverName]);
      if (account.bankName) rows.push(['Банк', account.bankName]);
      if (account.type === 'iban') {
        rows.push(['IBAN', account.iban]);
        rows.push(['IBAN без пробелов', normalizeIban(account.iban)]);
        rows.push(['BIC / SWIFT', account.bic]);
      } else {
        rows.push(['Номер карты', account.cardNumber]);
      }
      rows.push(['Назначение платежа', paymentReference]);
    } else {
      rows.push(['Bénéficiaire', account.receiverName]);
      if (account.bankName) rows.push(['Banque', account.bankName]);
      if (account.type === 'iban') {
        rows.push(['IBAN', account.iban]);
        rows.push(['IBAN sans espaces', normalizeIban(account.iban)]);
        rows.push(['BIC / SWIFT', account.bic]);
      } else {
        rows.push(['Numéro de carte', account.cardNumber]);
      }
      rows.push(['Libellé du virement', paymentReference]);
    }
    return rows;
  };

  const transferRows = buildTransferRows();

  const ibanWarning = account?.type === 'iban'
    ? `<p style="margin:8px 0 0;font-size:11px;color:#888;line-height:1.5;font-family:Arial,sans-serif;">
        ${isRU
          ? 'Если ваш банк не принимает IBAN с пробелами, вставьте IBAN без пробелов — это тот же самый счёт.'
          : 'Si votre banque n\'accepte pas l\'IBAN avec espaces, collez l\'IBAN sans espaces — il s\'agit du même compte.'}
       </p>`
    : '';

  const transferHtml = isBankTransfer && account ? `
  <div style="background:#f0ede8;border-radius:4px;padding:16px 20px;margin-top:20px;">
    <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;text-transform:uppercase;
              color:#999;font-family:Arial,sans-serif;">
      ${isRU ? 'Реквизиты для перевода' : 'Coordonnées bancaires'}
    </p>
    ${infoTable(transferRows)}
    ${ibanWarning}
  </div>` : '';

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${greeting}</p>
    ${infoTable(rows)}
    ${codeBlock(data.ticketCode, ticketLabel)}
    ${noteBlock(payNote)}
    ${transferHtml}`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, headerTitle, bodyHtml);

  // Текстовая версия письма
  const buildTransferText = (): string[] => {
    if (!isBankTransfer || !account) return [];
    const lines: string[] = ['', isRU ? 'Реквизиты для перевода:' : 'Coordonnées bancaires :'];
    lines.push(isRU ? `Получатель: ${account.receiverName}` : `Bénéficiaire : ${account.receiverName}`);
    if (account.bankName) lines.push(isRU ? `Банк: ${account.bankName}` : `Banque : ${account.bankName}`);
    if (account.type === 'iban') {
      lines.push(`IBAN: ${account.iban}`);
      lines.push(isRU ? `IBAN без пробелов: ${normalizeIban(account.iban)}` : `IBAN sans espaces : ${normalizeIban(account.iban)}`);
      lines.push(`BIC / SWIFT: ${account.bic}`);
    } else {
      lines.push(isRU ? `Номер карты: ${account.cardNumber}` : `Numéro de carte : ${account.cardNumber}`);
    }
    lines.push(isRU ? `Назначение платежа: ${paymentReference}` : `Libellé du virement : ${paymentReference}`);
    return lines;
  };

  const transferText = buildTransferText();

  const text = isRU
    ? [
        THEATRE_NAME,
        '',
        `Здравствуйте, ${data.userName}!`,
        'Ваше бронирование принято.',
        '',
        `Спектакль: ${data.showTitle}`,
        `Дата: ${dateStr} · ${data.showTime}`,
        `Билеты: ${data.ticketsCount} шт.`,
        `Сумма: ${data.totalAmount} €`,
        `Код брони: ${data.ticketCode}`,
        '',
        payNote,
        ...transferText,
        '',
        THEATRE_ADDRESS,
        `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
      ].join('\n')
    : [
        THEATRE_NAME,
        '',
        `Bonjour, ${data.userName} !`,
        'Merci pour votre réservation. Votre réservation est reçue.',
        '',
        `Spectacle : ${data.showTitle}`,
        `Date : ${dateStr} · ${data.showTime}`,
        `Billets : ${data.ticketsCount}`,
        `Montant : ${data.totalAmount} €`,
        `Code : ${data.ticketCode}`,
        '',
        payNote,
        ...transferText,
        '',
        THEATRE_ADDRESS,
        `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
      ].join('\n');

  return { subject, html, text };
}

function buildStatusEmail(data: BookingStatusEmailData): { subject: string; html: string; text: string } {
  const isRU    = data.lang === 'RU';
  const dateStr = localeDate(data.showDate, data.lang);

  const STATUS_COPY: Record<
    BookingStatusEmailData['newStatus'],
    { subjectRU: string; subjectFR: string; headerRU: string; headerFR: string; noteRU: string; noteFR: string }
  > = {
    confirmed: {
      subjectRU: `Бронирование подтверждено: ${data.showTitle}`,
      subjectFR: `Réservation confirmée : ${data.showTitle}`,
      headerRU:  'Бронирование подтверждено',
      headerFR:  'Réservation confirmée',
      noteRU:    'Ваше место зарезервировано. Приходите за 15 минут до начала.',
      noteFR:    'Votre place est réservée. Venez 15 minutes avant le début du spectacle.',
    },
    cancelled: {
      subjectRU: `Бронирование отменено: ${data.showTitle}`,
      subjectFR: `Réservation annulée : ${data.showTitle}`,
      headerRU:  'Бронирование отменено',
      headerFR:  'Réservation annulée',
      noteRU:    'Если у вас есть вопросы, напишите нам.',
      noteFR:    'Nous espérons vous revoir bientôt. Pour toute question, n\'hésitez pas à nous contacter.',
    },
    attended: {
      subjectRU: `Спасибо за визит: ${data.showTitle}`,
      subjectFR: `Merci de votre visite : ${data.showTitle}`,
      headerRU:  'Спасибо, что были с нами!',
      headerFR:  'Merci d\'avoir été avec nous !',
      noteRU:    'Будем рады видеть вас снова. Следите за нашей афишей.',
      noteFR:    'Nous serons ravis de vous revoir. Suivez notre programme.',
    },
  };

  const copy   = STATUS_COPY[data.newStatus];
  const subject = isRU ? copy.subjectRU : copy.subjectFR;
  const header  = isRU ? copy.headerRU  : copy.headerFR;
  const note    = isRU ? copy.noteRU    : copy.noteFR;
  const greeting = isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName}&nbsp;!`;
  const ticketLabel = isRU ? 'Код брони' : 'Code de réservation';

  const rows: [string, string][] = isRU ? [
    ['Спектакль', data.showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ['Билеты',    `${data.ticketsCount} шт.`],
  ] : [
    ['Spectacle', data.showTitle],
    ['Date',      `${dateStr} · ${data.showTime}`],
    ['Billets',   `${data.ticketsCount} billet${data.ticketsCount > 1 ? 's' : ''}`],
  ];

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${greeting}</p>
    ${infoTable(rows)}
    ${codeBlock(data.ticketCode, ticketLabel)}
    ${noteBlock(note)}
    <p style="margin:16px 0 0;font-size:12px;color:#aaa;">
      <a href="${THEATRE_MAPS}" style="color:#c9a96e;text-decoration:none;">${THEATRE_ADDRESS}</a>
    </p>`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, header, bodyHtml);

  const text = [
    THEATRE_NAME, '',
    isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName} !`,
    isRU ? header : header, '',
    isRU ? `Спектакль: ${data.showTitle}` : `Spectacle : ${data.showTitle}`,
    isRU ? `Дата: ${dateStr} · ${data.showTime}` : `Date : ${dateStr} · ${data.showTime}`,
    isRU ? `Код брони: ${data.ticketCode}` : `Code : ${data.ticketCode}`,
    '', note, '',
    THEATRE_ADDRESS, `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}

function buildPaymentPaidEmail(data: PaymentPaidEmailData): { subject: string; html: string; text: string } {
  const isRU               = data.lang === 'RU';
  const isAlreadyConfirmed = data.bookingStatus === 'confirmed';
  const dateStr            = localeDate(data.showDate, data.lang);

  const subject = isRU
    ? `${THEATRE_NAME} — оплата получена: ${data.showTitle}`
    : `${THEATRE_NAME} — paiement reçu · votre place est confirmée : ${data.showTitle}`;

  const headerTitle = isRU ? 'Оплата получена' : 'Paiement reçu';
  const greeting    = isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName}&nbsp;!`;
  const ticketLabel = isRU ? 'Код брони' : 'Code de réservation';

  const nextNote = isRU
    ? (isAlreadyConfirmed
        ? 'Ваша бронь подтверждена. Ждём вас в театре!'
        : 'Бронь ожидает подтверждения. Мы свяжемся с вами в ближайшее время.')
    : (isAlreadyConfirmed
        ? 'Votre réservation est confirmée. Nous vous attendons au théâtre&nbsp;!'
        : 'Votre réservation est en attente de confirmation. Nous vous contacterons prochainement.');

  const rows: [string, string][] = isRU ? [
    ['Спектакль', data.showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ['Билеты',    `${data.ticketsCount} шт.`],
    ['Сумма',     `${data.totalAmount}&nbsp;€`],
  ] : [
    ['Spectacle', data.showTitle],
    ['Date',      `${dateStr} · ${data.showTime}`],
    ['Billets',   `${data.ticketsCount} billet${data.ticketsCount > 1 ? 's' : ''}`],
    ['Montant',   `${data.totalAmount}&nbsp;€`],
  ];

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${greeting}</p>
    ${infoTable(rows)}
    ${codeBlock(data.ticketCode, ticketLabel)}
    ${noteBlock(nextNote)}
    <p style="margin:16px 0 0;font-size:12px;color:#aaa;">
      <a href="${THEATRE_MAPS}" style="color:#c9a96e;text-decoration:none;">${THEATRE_ADDRESS}</a>
    </p>`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, headerTitle, bodyHtml);

  const text = [
    THEATRE_NAME, '',
    isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName} !`,
    isRU ? 'Мы получили вашу оплату.' : 'Nous avons reçu votre paiement.',
    '',
    isRU ? `Спектакль: ${data.showTitle}` : `Spectacle : ${data.showTitle}`,
    isRU ? `Дата: ${dateStr} · ${data.showTime}` : `Date : ${dateStr} · ${data.showTime}`,
    isRU ? `Сумма: ${data.totalAmount} €` : `Montant : ${data.totalAmount} €`,
    isRU ? `Код брони: ${data.ticketCode}` : `Code : ${data.ticketCode}`,
    '', nextNote, '',
    THEATRE_ADDRESS, `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}

export interface NewShowEmailData {
  userEmail:   string;
  userName:    string;
  showTitle:   string;
  showDate:    string;
  showTime:    string;
  price?:      string;
  description?: string;
  showUrl:     string;
  lang:        'RU' | 'FR';
}

function buildNewShowEmail(data: NewShowEmailData): { subject: string; html: string; text: string } {
  const isRU    = data.lang === 'RU';
  const dateStr = localeDate(data.showDate, data.lang);

  const subject = isRU
    ? `Новый спектакль в театре ТЕТ-А-ТЕТ: ${data.showTitle}`
    : `Nouveau spectacle au Théâtre Tête-à-Tête : ${data.showTitle}`;

  const headerTitle = isRU ? 'Новый спектакль в театре ТЕТ-А-ТЕТ' : 'Nouveau spectacle au Théâtre Tête-à-Tête';
  const greeting    = isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName}&nbsp;!`;

  const rows: [string, string][] = isRU ? [
    ['Спектакль', data.showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ...(data.price ? [['Билеты', data.price] as [string, string]] : []),
  ] : [
    ['Spectacle', data.showTitle],
    ['Date',      `${dateStr} · ${data.showTime}`],
    ...(data.price ? [['Billets', data.price] as [string, string]] : []),
  ];

  const descBlock = data.description
    ? noteBlock(data.description)
    : '';

  const intro = isRU
    ? `В афише театра ТЕТ-А-ТЕТ появился спектакль ${data.showTitle}. Вы можете открыть страницу спектакля, посмотреть описание и забронировать билет онлайн.`
    : 'Un nouveau spectacle est disponible au Théâtre Tête-à-Tête à Nice. Vous pouvez ouvrir la page du spectacle, consulter la description et réserver votre billet en ligne.';
  const ctaLabel = isRU ? 'Открыть спектакль' : 'Voir le spectacle';

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6;">${intro}</p>
    ${infoTable(rows)}
    ${descBlock}
    <p style="margin:20px 0 0;text-align:center;">
      <a href="${data.showUrl}"
         style="display:inline-block;background:#111;color:#fff;padding:12px 28px;
                border-radius:4px;text-decoration:none;font-size:13px;
                letter-spacing:2px;font-family:Arial,sans-serif;">
        ${ctaLabel}
      </a>
    </p>`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, headerTitle, bodyHtml);

  const text = [
    THEATRE_NAME, '',
    isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName} !`,
    intro,
    '',
    isRU ? `Спектакль: ${data.showTitle}` : `Spectacle : ${data.showTitle}`,
    isRU ? `Дата: ${dateStr} · ${data.showTime}` : `Date : ${dateStr} · ${data.showTime}`,
    ...(data.price ? [isRU ? `Билеты: ${data.price}` : `Billets : ${data.price}`] : []),
    '',
    data.showUrl,
    '',
    THEATRE_ADDRESS,
    `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}

// Возвращает true/false по реальному результату запроса.
// Бронирование остаётся best-effort: вызывающий код для писем брони
// игнорирует возвращаемое значение и/или ловит ошибку через .catch(() => {}).
// Рассылка (newsletter) использует именно это значение, чтобы показывать
// честный результат отправки в админке.
async function callEndpoint(payload: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  // По умолчанию /api/send-email — работает на Vercel без настройки env во frontend
  const endpoint = (import.meta.env.VITE_EMAIL_ENDPOINT as string | undefined) ?? '/api/send-email';

  try {
    const resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
      console.warn('[emailService] Endpoint returned', resp.status, err);
      return false;
    }
    return true;
  } catch (err) {
    // Сетевая ошибка — бронирование не блокируем, но сообщаем вызывающему коду об отказе
    console.warn('[emailService] Fetch error:', err);
    return false;
  }
}

// Письма брони отправляются best-effort: бронирование не должно блокироваться
// или считаться неуспешным из-за сбоя почты, поэтому наружу остаётся Promise<void>.
export async function sendBookingConfirmationEmail(data: BookingEmailData): Promise<void> {
  if (!data.userEmail) {
    console.warn('[emailService] sendBookingConfirmationEmail: no recipient email, skipping');
    return;
  }
  const { subject, html, text } = buildConfirmationEmail(data);
  await callEndpoint({ to: data.userEmail, subject, html, text });
}

// Обновление статуса брони (confirmed / cancelled / attended) — отправляется из AdminPage.
export async function sendBookingStatusUpdateEmail(data: BookingStatusEmailData): Promise<void> {
  const { subject, html, text } = buildStatusEmail(data);
  await callEndpoint({ to: data.userEmail, subject, html, text });
}

// Подтверждение оплаты — отправляется когда admin отмечает бронь как оплаченную.
export async function sendPaymentPaidEmail(data: PaymentPaidEmailData): Promise<void> {
  if (!data.userEmail) return;
  const { subject, html, text } = buildPaymentPaidEmail(data);
  await callEndpoint({ to: data.userEmail, subject, html, text });
}

// Анонс нового спектакля — отправлять по одному получателю;
// AdminPage перебирает список через getUsersForNewsletter().
// В отличие от писем брони, рассылка должна честно сообщать админу об успехе/отказе,
// поэтому возвращаем boolean по реальному ответу API, а не глотаем ошибку.
export async function sendNewShowAnnouncementEmail(data: NewShowEmailData): Promise<boolean> {
  if (!data.userEmail) return false;
  const { subject, html, text } = buildNewShowEmail(data);
  return callEndpoint({ to: data.userEmail, subject, html, text });
}
