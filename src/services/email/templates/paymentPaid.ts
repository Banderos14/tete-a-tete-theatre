// Подтверждение оплаты.

import { escapeEmailHtml, localeDate, wrapHtml, infoTable, codeBlock, noteBlock,
         THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE, THEATRE_MAPS } from '../layout';
import type { PaymentPaidEmailData } from '../types';

export function buildPaymentPaidEmail(data: PaymentPaidEmailData): { subject: string; html: string; text: string } {
  const isRU               = data.lang === 'RU';
  const isAlreadyConfirmed = data.bookingStatus === 'confirmed';
  const dateStr            = localeDate(data.showDate, data.lang);

  const subject = isRU
    ? `${THEATRE_NAME} — оплата получена: ${data.showTitle}`
    : `${THEATRE_NAME} — paiement reçu · votre place est confirmée : ${data.showTitle}`;

  const headerTitle = isRU ? 'Оплата получена' : 'Paiement reçu';
  const greeting    = isRU ? `Здравствуйте, ${escapeEmailHtml(data.userName)}!` : `Bonjour, ${escapeEmailHtml(data.userName)}&nbsp;!`;
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
