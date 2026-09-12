// Подтверждение брони.

import { getPaymentAccount, normalizeIban } from '../../../config/payment';
import { escapeEmailHtml, localeDate, wrapHtml, infoTable, codeBlock, noteBlock,
         THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE, PAY_REF_PREFIX } from '../layout';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import type { BookingEmailData } from '../types';

export function buildConfirmationEmail(data: BookingEmailData): { subject: string; html: string; text: string } {
  const isRU           = data.lang === 'RU';
  const isBankTransfer = data.paymentMethod === 'bank_transfer';
  const dateStr        = localeDate(data.showDate, data.lang);
  // Во французском письме должно стоять французское название спектакля.
  const showTitle      = localizedShowTitle(data, data.lang);

  const subject = isRU
    ? `${THEATRE_NAME} — бронирование принято: ${showTitle}`
    : `${THEATRE_NAME} — réservation reçue : ${showTitle}`;

  const headerTitle = isRU ? 'Бронирование принято' : 'Réservation reçue';
  const greeting    = isRU
    ? `Здравствуйте, ${escapeEmailHtml(data.userName)}!`
    : `Bonjour, ${escapeEmailHtml(data.userName)}&nbsp;!<br><span style="font-size:13px;color:#888;">Merci pour votre réservation&nbsp;!</span>`;
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
    ['Зритель',   escapeEmailHtml(data.userName)],
    ['Спектакль', showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ['Билеты',    `${data.ticketsCount} шт.`],
    ...amountRows,
  ] : [
    ['Spectateur', escapeEmailHtml(data.userName)],
    ['Spectacle',  showTitle],
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
        `Спектакль: ${showTitle}`,
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
        `Spectacle : ${showTitle}`,
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
