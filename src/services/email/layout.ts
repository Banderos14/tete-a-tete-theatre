// Общая вёрстка писем: каркас, таблица реквизитов, блок кода, примечание.
//
// Почтовые клиенты не умеют во внешний CSS и плохо — во flex/grid, поэтому
// разметка табличная, а стили инлайновые. Это не «легаси», а требование среды.

import { PAYMENT_CONFIG } from '../../config/payment';

export const THEATRE_NAME    = PAYMENT_CONFIG.receiverName;
export const THEATRE_ADDRESS = PAYMENT_CONFIG.address;
export const THEATRE_EMAIL   = PAYMENT_CONFIG.paymentEmail;
export const THEATRE_PHONE   = PAYMENT_CONFIG.paymentPhone;
export const PAY_REF_PREFIX  = PAYMENT_CONFIG.paymentReferencePrefix;
export const THEATRE_MAPS    = PAYMENT_CONFIG.googleMapsUrl;

// showDate хранится как "17 Май 2026" — перевод месяца для FR-писем
const MONTHS_RU_TO_FR: Record<string, string> = {
  'Янв': 'Janvier', 'Фев': 'Février',  'Мар': 'Mars',      'Апр': 'Avril',
  'Май': 'Mai',      'Июн': 'Juin',     'Июл': 'Juillet',   'Авг': 'Août',
  'Сен': 'Septembre','Окт': 'Octobre',  'Ноя': 'Novembre',  'Дек': 'Décembre',
};

export function localeDate(showDate: string, lang: 'RU' | 'FR'): string {
  if (lang === 'RU') return showDate;
  return showDate.replace(/[А-ЯЁ][а-яё]+/, m => MONTHS_RU_TO_FR[m] ?? m);
}

// Экранирование пользовательских значений перед вставкой в HTML письма.
//
// userName приходит из displayName аккаунта, то есть управляется пользователем.
// Почтовые клиенты скриптов не исполняют, но разметку вставить можно было —
// достаточно, чтобы испортить вёрстку письма или подсунуть чужую ссылку.
export function escapeEmailHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapHtml(lang: string, subject: string, headerTitle: string, bodyHtml: string): string {
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

export function infoTable(rows: [string, string][]): string {
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

export function codeBlock(code: string, label: string): string {
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

// Кнопка-ссылка. Почтовые клиенты не умеют в CSS-кнопки, поэтому это <a>
// с инлайновыми стилями — и она остаётся кликабельной ссылкой везде.
export function linkButton(href: string, label: string): string {
  return `
  <div style="margin:20px 0 0;">
    <a href="${href}" style="display:inline-block;background:#111111;color:#ffffff;
              text-decoration:none;padding:13px 26px;border-radius:4px;font-size:13px;
              letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif;">
      ${label}
    </a>
  </div>`;
}

export function noteBlock(text: string): string {
  return `
  <div style="background:#f9f6f0;border-left:3px solid #c9a96e;
              padding:12px 16px;border-radius:4px;">
    <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${text}</p>
  </div>`;
}
