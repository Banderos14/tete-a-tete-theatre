// Подтверждение оплаты.

import { escapeEmailHtml, localeDate, wrapHtml, infoTable, codeBlock, noteBlock, linkButton,
         THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE, THEATRE_MAPS } from '../layout';
import { getMyTicketsUrl } from '../../../utils/accountUrl';
import { localizedShowTitle } from '../../../../shared/catalog/showTitle';
import type { PaymentPaidEmailData } from '../types';

export function buildPaymentPaidEmail(data: PaymentPaidEmailData): { subject: string; html: string; text: string } {
  const isRU               = data.lang === 'RU';
  const isAlreadyConfirmed = data.bookingStatus === 'confirmed';
  const dateStr            = localeDate(data.showDate, data.lang);
  const showTitle          = localizedShowTitle(data, data.lang);

  const subject = isRU
    ? `${THEATRE_NAME} — оплата получена: ${showTitle}`
    : `${THEATRE_NAME} — paiement reçu · votre place est confirmée : ${showTitle}`;

  const headerTitle = isRU ? 'Оплата получена' : 'Paiement reçu';
  const greeting    = isRU ? `Здравствуйте, ${escapeEmailHtml(data.userName)}!` : `Bonjour, ${escapeEmailHtml(data.userName)}&nbsp;!`;
  const ticketLabel = isRU ? 'Код брони' : 'Code de réservation';

  // Главное, что человек должен унести из письма: бронь подтверждена и QR
  // лежит в кабинете. Ссылка ведёт прямо в «Мои билеты», а не на главную.
  const ticketsUrl   = getMyTicketsUrl();
  const ticketsLabel = isRU ? 'Открыть мои билеты' : 'Ouvrir mes billets';

  const nextNote = isRU
    ? (isAlreadyConfirmed
        ? 'Оплата подтверждена, ваша бронь подтверждена. Ждём вас в Théâtre Tête-à-Tête.<br><br>'
          + 'Ваш QR-код находится в личном кабинете, в разделе «Мои билеты». Покажите его сотруднику театра при входе.'
        : 'Бронь ожидает подтверждения. Мы свяжемся с вами в ближайшее время.')
    : (isAlreadyConfirmed
        ? 'Votre paiement est confirmé et votre réservation est validée. Nous vous attendons au Théâtre Tête-à-Tête.<br><br>'
          + 'Votre QR code se trouve dans votre espace personnel, rubrique «&nbsp;Mes billets&nbsp;». Présentez-le au personnel du théâtre à l\'entrée.'
        : 'Votre réservation est en attente de confirmation. Nous vous contacterons prochainement.');

  const rows: [string, string][] = isRU ? [
    ['Спектакль', showTitle],
    ['Дата',      `${dateStr} · ${data.showTime}`],
    ['Билеты',    `${data.ticketsCount} шт.`],
    ['Сумма',     `${data.totalAmount}&nbsp;€`],
  ] : [
    ['Spectacle', showTitle],
    ['Date',      `${dateStr} · ${data.showTime}`],
    ['Billets',   `${data.ticketsCount} billet${data.ticketsCount > 1 ? 's' : ''}`],
    ['Montant',   `${data.totalAmount}&nbsp;€`],
  ];

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#333;">${greeting}</p>
    ${infoTable(rows)}
    ${codeBlock(data.ticketCode, ticketLabel)}
    ${noteBlock(nextNote)}
    ${linkButton(ticketsUrl, ticketsLabel)}
    <p style="margin:16px 0 0;font-size:12px;color:#aaa;">
      <a href="${THEATRE_MAPS}" style="color:#c9a96e;text-decoration:none;">${THEATRE_ADDRESS}</a>
    </p>`;

  const html = wrapHtml(isRU ? 'ru' : 'fr', subject, headerTitle, bodyHtml);

  const text = [
    THEATRE_NAME, '',
    isRU ? `Здравствуйте, ${data.userName}!` : `Bonjour, ${data.userName} !`,
    isRU ? 'Мы получили вашу оплату.' : 'Nous avons reçu votre paiement.',
    '',
    isRU ? `Спектакль: ${showTitle}` : `Spectacle : ${showTitle}`,
    isRU ? `Дата: ${dateStr} · ${data.showTime}` : `Date : ${dateStr} · ${data.showTime}`,
    isRU ? `Сумма: ${data.totalAmount} €` : `Montant : ${data.totalAmount} €`,
    isRU ? `Код брони: ${data.ticketCode}` : `Code : ${data.ticketCode}`,
    '',
    isRU
      ? 'Оплата подтверждена, ваша бронь подтверждена. Ждём вас в Théâtre Tête-à-Tête.'
      : 'Votre paiement est confirmé et votre réservation est validée. Nous vous attendons au Théâtre Tête-à-Tête.',
    isRU
      ? 'Ваш QR-код находится в личном кабинете, в разделе «Мои билеты». Покажите его сотруднику театра при входе.'
      : 'Votre QR code se trouve dans votre espace personnel, rubrique « Mes billets ». Présentez-le au personnel du théâtre à l\'entrée.',
    '',
    `${ticketsLabel}: ${ticketsUrl}`,
    '',
    THEATRE_ADDRESS, `${THEATRE_EMAIL} · ${THEATRE_PHONE}`,
  ].join('\n');

  return { subject, html, text };
}
