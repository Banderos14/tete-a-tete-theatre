// Генерация кода билета.
//
// Алфавит без визуально похожих символов (0/O, 1/I/L): код диктуют голосом
// и переписывают от руки. randomInt даёт равномерное распределение без
// modulo bias, в отличие от прежнего randomBytes()[i] % 31.

import { randomInt } from 'node:crypto';

export const TICKET_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += TICKET_CODE_CHARSET[randomInt(TICKET_CODE_CHARSET.length)];
  }
  return code;
}
