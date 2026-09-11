// Смена статуса брони: confirmed / cancelled / attended.

import { escapeEmailHtml, localeDate, wrapHtml, infoTable, codeBlock, noteBlock,
         THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE, THEATRE_MAPS } from '../layout';
import type { BookingStatusEmailData } from '../types';

export function buildStatusEmail(data: BookingStatusEmailData): { subject: string; html: string; text: string } {
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
  const greeting = isRU ? `Здравствуйте, ${escapeEmailHtml(data.userName)}!` : `Bonjour, ${escapeEmailHtml(data.userName)}&nbsp;!`;
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
