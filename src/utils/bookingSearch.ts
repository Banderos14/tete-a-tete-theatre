// Поиск брони по тому, что зритель может назвать у входа: имя, e-mail,
// телефон или код брони. Чистая функция без React и Firebase — ею пользуются
// и вкладка «Брони» в админке, и поиск на странице проверки билетов.
//
// Полнотекстового поиска в Firestore нет и для театра на 50 мест он не нужен:
// брони одного спектакля — это десятки документов, фильтр по уже загруженному
// списку мгновенный и не тратит ни одного лишнего чтения.

import { normalizeTicketCodeInput } from '../../shared/domain/ticketCode';

export interface SearchableBooking {
  userName?:         string;
  userEmail?:        string;
  userPhone?:        string;
  ticketCode?:       string;
  paymentReference?: string;
}

/** Нижний регистр без диакритики: «Élodie» находится по «elodie», «Ёлкин» — по «елкин». */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .trim();
}

const digitsOf = (value: string) => value.replace(/\D/g, '');

/**
 * Подходит ли бронь под строку поиска.
 *
 * - Пустой запрос подходит всем.
 * - Код брони ищется и с дефисом, и без него, в любом регистре.
 * - Телефон — по цифрам: «06 12 34» находит «+33 6 12 34 56 78» по хвосту
 *   (ведущий 0 французского номера отбрасывается). Короче 4 цифр телефон не
 *   сравнивается, иначе «2026» совпадал бы с кем попало.
 * - Имя: все слова запроса должны встретиться в имени — «анна пет» находит
 *   «Петрова Анна».
 */
export function matchesBookingQuery(b: SearchableBooking, rawQuery: string): boolean {
  const query = fold(rawQuery);
  if (!query) return true;

  const code = normalizeTicketCodeInput(rawQuery);
  if (code && b.ticketCode?.toUpperCase() === code) return true;

  const compactQuery = query.replace(/[\s-]/g, '').toUpperCase();
  if (compactQuery.length >= 3) {
    const compactCode = (b.ticketCode ?? '').replace(/-/g, '').toUpperCase();
    if (compactCode.includes(compactQuery)) return true;
    const compactRef = (b.paymentReference ?? '').replace(/[\s-]/g, '').toUpperCase();
    if (compactRef && compactRef.includes(compactQuery)) return true;
  }

  if (b.userEmail && fold(b.userEmail).includes(query)) return true;

  const queryDigits = digitsOf(query).replace(/^0+/, '');
  if (queryDigits.length >= 4 && /^[\d\s+().-]+$/.test(query)) {
    return digitsOf(b.userPhone ?? '').includes(queryDigits);
  }

  const name = fold(b.userName ?? '');
  const words = query.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every(w => name.includes(w));
}

export function filterBookings<T extends SearchableBooking>(bookings: T[], query: string): T[] {
  return query.trim() ? bookings.filter(b => matchesBookingQuery(b, query)) : bookings;
}
