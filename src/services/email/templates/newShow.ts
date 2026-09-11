// Анонс нового спектакля (рассылка).

import { escapeEmailHtml, localeDate, wrapHtml, infoTable, noteBlock,
         THEATRE_NAME, THEATRE_ADDRESS, THEATRE_EMAIL, THEATRE_PHONE } from '../layout';
import type { NewShowEmailData } from '../types';

export function buildNewShowEmail(data: NewShowEmailData): { subject: string; html: string; text: string } {
  const isRU    = data.lang === 'RU';
  const dateStr = localeDate(data.showDate, data.lang);

  const subject = isRU
    ? `Новый спектакль в театре ТЕТ-А-ТЕТ: ${data.showTitle}`
    : `Nouveau spectacle au Théâtre Tête-à-Tête : ${data.showTitle}`;

  const headerTitle = isRU ? 'Новый спектакль в театре ТЕТ-А-ТЕТ' : 'Nouveau spectacle au Théâtre Tête-à-Tête';
  const greeting    = isRU ? `Здравствуйте, ${escapeEmailHtml(data.userName)}!` : `Bonjour, ${escapeEmailHtml(data.userName)}&nbsp;!`;

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
