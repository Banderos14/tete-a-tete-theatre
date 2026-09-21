// Поиск брони у входа и в админке: код, имя, e-mail, телефон.

import { describe, it, expect } from 'vitest';
import { matchesBookingQuery, filterBookings } from '../../src/utils/bookingSearch';
import { normalizeTicketCodeInput, ticketCheckUrl, ticketCheckPath } from '../../shared/domain/ticketCode';
import { parseTicketCodeFromScan } from '../../src/utils/parseTicketCode';

const anna = {
  userName: 'Анна Петрова', userEmail: 'Anna.Petrova@Example.com',
  userPhone: '+33 6 12 34 56 78', ticketCode: 'PKX3-E222', paymentReference: 'TETEATETE-PKX3-E222',
};
const elodie = { userName: 'Élodie Martin', userEmail: 'elodie@mail.fr', userPhone: '+33 7 00 00 00 01', ticketCode: 'ZZZZ-9999' };

describe('normalizeTicketCodeInput', () => {
  it.each([
    ['pkx3-e222', 'PKX3-E222'],
    ['PKX3E222', 'PKX3-E222'],
    ['  pkx3 e222 ', 'PKX3-E222'],
    ['PKX3–E222', 'PKX3-E222'], // длинное тире из заметок телефона
  ])('%s → %s', (raw, code) => {
    expect(normalizeTicketCodeInput(raw)).toBe(code);
  });

  it.each(['', 'PKX3', 'PKX3-E2222', 'анна', 'PKX3-E22!'])('%s → null', (raw) => {
    expect(normalizeTicketCodeInput(raw)).toBeNull();
  });
});

describe('ссылка в QR — одна на кабинет, PDF и письмо', () => {
  it('строится по коду и разбирается сканером обратно', () => {
    const url = ticketCheckUrl('https://www.theatre-teteatete.fr/', 'PKX3-E222');
    expect(url).toBe('https://www.theatre-teteatete.fr/#/admin/checkin?ticket=PKX3-E222');
    expect(parseTicketCodeFromScan(url)).toBe('PKX3-E222');
    expect(ticketCheckPath('AB CD')).toBe('/#/admin/checkin?ticket=AB%20CD');
  });
});

describe('matchesBookingQuery', () => {
  it('пустой запрос подходит всем', () => {
    expect(filterBookings([anna, elodie], '  ')).toHaveLength(2);
  });

  it('код брони — в любом регистре, с дефисом и без', () => {
    expect(matchesBookingQuery(anna, 'pkx3e222')).toBe(true);
    expect(matchesBookingQuery(anna, 'PKX3-E222')).toBe(true);
    expect(matchesBookingQuery(anna, 'e222')).toBe(true);
    expect(matchesBookingQuery(elodie, 'pkx3')).toBe(false);
  });

  it('референс перевода находит бронь', () => {
    expect(matchesBookingQuery(anna, 'TETEATETE-PKX3')).toBe(true);
  });

  it('имя — по словам в любом порядке, без регистра и диакритики', () => {
    expect(matchesBookingQuery(anna, 'петрова анна')).toBe(true);
    expect(matchesBookingQuery(anna, 'анн пет')).toBe(true);
    expect(matchesBookingQuery(elodie, 'elodie')).toBe(true);
    expect(matchesBookingQuery(anna, 'иванова')).toBe(false);
  });

  it('e-mail — по подстроке без регистра', () => {
    expect(matchesBookingQuery(anna, 'anna.petrova@')).toBe(true);
    expect(matchesBookingQuery(elodie, 'mail.fr')).toBe(true);
  });

  it('телефон — по цифрам, французский ведущий 0 не мешает', () => {
    expect(matchesBookingQuery(anna, '06 12 34')).toBe(true);
    expect(matchesBookingQuery(anna, '+33612345678')).toBe(true);
    expect(matchesBookingQuery(elodie, '06 12 34')).toBe(false);
  });

  it('короткие числа не совпадают с телефонами случайно', () => {
    expect(matchesBookingQuery(anna, '12')).toBe(false);
  });
});
