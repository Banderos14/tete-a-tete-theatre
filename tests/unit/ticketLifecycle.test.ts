// Жизненный цикл билета целиком: бронь → код → QR → сканер → оплата →
// проход → повторный скан.
//
// Отдельные звенья уже покрыты (capacity, checkin, bookingRules), но между
// ними нет ни одного теста, который проходил бы цепочку насквозь. Именно на
// стыках она и рвётся: код билета живёт на сервере, QR строит фронтенд,
// разбирает его сканер — и каждый из трёх шагов можно поменять, не заметив
// двух других.

import { describe, it, expect } from 'vitest';
import {
  canUserCancel, checkCapacity, sumOccupiedTickets, isBookingAttended, occupiesCapacity,
} from '../../shared/domain/bookingRules.js';
import { THEATRE_CAPACITY } from '../../shared/catalog/shows.js';
import { parseTicketCodeFromScan } from '../../src/utils/parseTicketCode.js';
import { generateTicketCode } from '../../server/booking/ticketCode.js';
import { endpointSource, projectSource, screenSource } from '../helpers/serverSource.js';
import {
  paidConfirmed, unpaidOnSite, awaitingTransfer, expiredTransfer,
  cancelled, attended, multiTicket,
} from '../helpers/bookingFixtures.js';

const checkinApi = endpointSource('api/checkin-ticket.ts');
const scanScreen = screenSource('src/pages/TicketCheckPage');
const qrSource   = projectSource('src/services/qrService.ts');

// Формат ссылки, которую фронтенд кладёт в QR. Берётся из самого qrService,
// а не переписывается в тест: иначе тест продолжит проверять формат, который
// проект уже не выпускает.
function qrUrlFor(ticketCode: string): string {
  const template = qrSource.match(/const url = `([^`]+)`/)?.[1];
  expect(template, 'шаблон ссылки QR не найден в qrService').toBeTruthy();
  return template!
    .replace('${base}', 'https://www.theatre-teteatete.fr')
    .replace('${encodeURIComponent(ticketCode)}', encodeURIComponent(ticketCode));
}

describe('код билета → QR → сканер: цепочка замкнута', () => {
  it('сгенерированный сервером код проходит формат, который требует check-in', () => {
    const codeRe = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    for (let i = 0; i < 200; i++) {
      expect(generateTicketCode()).toMatch(codeRe);
    }
  });

  it('ссылка из QR разбирается сканером обратно в тот же код', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTicketCode();
      expect(parseTicketCodeFromScan(qrUrlFor(code))).toBe(code);
    }
  });

  it('QR ведёт на страницу проверки в формате HashRouter', () => {
    const url = qrUrlFor('AB12-CD34');
    expect(url).toContain('/#/admin/checkin?ticket=');
    expect(url).toContain('AB12-CD34');
  });

  it('чужой QR не притворяется билетом', () => {
    expect(parseTicketCodeFromScan('https://example.com/promo')).toBeNull();
    expect(parseTicketCodeFromScan('   ')).toBeNull();
    expect(parseTicketCodeFromScan('')).toBeNull();
  });
});

describe('оплата обязательна до прохода', () => {
  it('неоплаченный билет сервер не пускает в зал', () => {
    expect(checkinApi).toMatch(/paymentStatus !== 'paid'/);
    expect(checkinApi).toContain("refusal: 'not_paid'");
  });

  it('оплата на входе ставит paid и confirmed одной записью — и только потом возможен проход', () => {
    expect(checkinApi).toMatch(/paymentStatus: 'paid',\s*\n\s*status:\s*'confirmed'/);
  });

  it('кабинет показывает QR оплаченной броне и брони с оплатой на месте', () => {
    const tickets = projectSource('src/components/ui/ProfileDrawer/TicketsSection.tsx');
    expect(tickets).toMatch(/paymentStatus === 'paid' && b\.status === 'confirmed'/);
    expect(tickets).toMatch(/paymentMethod === 'on_site' && b\.paymentStatus === 'not_paid'/);
    // QR не показывается без кода: сканировать было бы нечего.
    expect(tickets).toContain('!!b.ticketCode');
  });
});

describe('повторный скан не пускает второй раз', () => {
  it('решение и запись происходят одной транзакцией — гонка двух сканеров невозможна', () => {
    expect(checkinApi).toContain('runTransaction');
    expect(checkinApi).toMatch(/if \(status === 'attended'\)/);
    expect(checkinApi).toContain("refusal: 'already_attended'");
  });

  it('интерфейс показывает второй скан как использованный билет, а не как ошибку', () => {
    expect(scanScreen).toContain("res.reason === 'already_attended'");
    expect(scanScreen).toContain('БИЛЕТ УЖЕ ИСПОЛЬЗОВАН');
  });

  it('посещённой считается только бронь со статусом attended', () => {
    expect(isBookingAttended(attended())).toBe(true);
    expect(isBookingAttended(paidConfirmed())).toBe(false);
    expect(isBookingAttended(unpaidOnSite())).toBe(false);
  });
});

describe('групповая бронь: один QR — несколько человек', () => {
  it('сканеру видно, сколько людей проходит по коду', () => {
    expect(scanScreen).toContain('seatsCount');
    expect(scanScreen).toContain('Количество');
  });

  it('при двух и более билетах количество набирается крупно', () => {
    expect(scanScreen).toContain('cardValueCountMany');
    expect(scanScreen).toMatch(/b\.seatsCount > 1/);
    expect(projectSource('src/pages/TicketCheckPage/TicketCheckPage.module.scss'))
      .toContain('.cardValueCountMany');
  });

  it('групповая бронь занимает столько мест, сколько в ней билетов', () => {
    expect(sumOccupiedTickets([multiTicket(3)])).toBe(3);
    expect(sumOccupiedTickets([multiTicket(3), paidConfirmed()])).toBe(4);
  });

  it('семейный пакет занимает три места при одной единице тарифа', () => {
    expect(sumOccupiedTickets([paidConfirmed({ ticketsCount: 1, seatsCount: 3 })])).toBe(3);
  });

  it('проход отмечается целиком на бронь — отдельных кодов на билет нет', () => {
    // Один ticketCode на бронь: найдя его, сервер отмечает всю бронь.
    expect(projectSource('server/booking/booking.repository.ts'))
      .toContain("where('ticketCode', '==', ticketCode).limit(1)");
    expect(checkinApi).toMatch(/status:\s*'attended'/);
  });
});

describe('билет не на тот вечер', () => {
  it('сервер отдаёт расхождение брони с каталогом отдельным признаком', () => {
    expect(checkinApi).toContain('showDateDiffers');
    expect(checkinApi).toContain('catalogDateDiffers');
  });

  it('сканер предупреждает о другой дате и у оплаченного билета, и у оплаты на месте', () => {
    expect(scanScreen).toContain('dateWarning');
    expect(scanScreen).toContain('Бронь на другую дату спектакля');
    // Предупреждение попадает в обе «действительные» карточки.
    expect(scanScreen.match(/\{dateWarning\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('билет прошедшего спектакля недействителен', () => {
    expect(scanScreen).toContain("showRelevance === 'too_late'");
    expect(scanScreen).toContain('Билет на прошедший спектакль');
  });
});

describe('PDF-билет доходит до сканера', () => {
  const pdfScan = projectSource('src/services/pdfScanService.ts');

  it('адрес воркера pdfjs берётся через ?url — он резолвится и в dev, и в сборке', () => {
    expect(pdfScan).toContain("'pdfjs-dist/build/pdf.worker.min.mjs?url'");
  });

  it('workerSrc присваивается из импортированного адреса, а не собирается на лету', () => {
    // Прежнее new URL('pdfjs-dist/...', import.meta.url) сборщик переписывал,
    // а dev-сервер — нет: вместо воркера приходил index.html, и разбор PDF
    // не завершался никогда. Сравниваем только код, без комментариев, —
    // в них прежняя форма упомянута нарочно.
    const code = pdfScan.replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('GlobalWorkerOptions.workerSrc = pdfWorkerUrl');
    expect(code).not.toMatch(/new URL\(\s*'pdfjs-dist/);
  });

  it('разбор PDF ограничен по времени — сканер не может зависнуть навсегда', () => {
    expect(pdfScan).toContain('PDF_PARSE_TIMEOUT_MS');
    expect(pdfScan).toContain('withTimeout(task.promise');
    expect(pdfScan).toContain('task.destroy()');
  });

  it('и PDF, и картинка идут в один и тот же разбор кода', () => {
    expect(scanScreen).toContain('convertPdfFirstPageToImageFile');
    expect(scanScreen).toContain('scanQrFromImageFile');
    expect(scanScreen).toContain('lookupByCode');
  });

  it('в PDF попадает тот же QR, что показан в кабинете', () => {
    // TicketCard отдаёт в генератор PDF уже построенную картинку QR,
    // а не строит вторую — разойтись им негде.
    const card = projectSource('src/components/ui/TicketCard/TicketCard.tsx');
    expect(card).toContain('generateTicketPdf(b, qrSrc, lang)');
    expect(card).toContain('generateTicketQR(b.ticketCode)');
  });
});

describe('отмена зрителем по состояниям брони', () => {
  const future = Date.now() + 24 * 60 * 60 * 1000;
  const past   = Date.now() - 60 * 1000;

  it('неоплаченную бронь отменить можно', () => {
    expect(canUserCancel(unpaidOnSite(), future).allowed).toBe(true);
    expect(canUserCancel(awaitingTransfer(), future).allowed).toBe(true);
  });

  it('оплаченную — нельзя', () => {
    expect(canUserCancel(paidConfirmed(), future)).toEqual({ allowed: false, reason: 'already_paid' });
  });

  it('посещённую — нельзя', () => {
    expect(canUserCancel(attended(), future)).toEqual({ allowed: false, reason: 'already_attended' });
  });

  it('отменённую повторно — нельзя', () => {
    expect(canUserCancel(cancelled(), future)).toEqual({ allowed: false, reason: 'already_cancelled' });
  });

  it('после начала спектакля — нельзя', () => {
    expect(canUserCancel(unpaidOnSite(), past)).toEqual({ allowed: false, reason: 'show_started' });
  });
});

describe('вместимость зала — 50 мест', () => {
  it('источник правды один и равен 50', () => {
    expect(THEATRE_CAPACITY).toBe(50);
  });

  it('пустой зал отдаёт все 50 мест', () => {
    expect(checkCapacity(0, 1, THEATRE_CAPACITY)).toEqual({ allowed: true, remaining: 50, soldOut: false });
  });

  it('на 49 занятых один билет проходит, а два — нет', () => {
    expect(checkCapacity(49, 1, THEATRE_CAPACITY).allowed).toBe(true);
    expect(checkCapacity(49, 2, THEATRE_CAPACITY).allowed).toBe(false);
    expect(checkCapacity(49, 2, THEATRE_CAPACITY).remaining).toBe(1);
  });

  it('полный зал не продаёт ничего', () => {
    const decision = checkCapacity(50, 1, THEATRE_CAPACITY);
    expect(decision.allowed).toBe(false);
    expect(decision.soldOut).toBe(true);
  });

  it('отменённые и протухшие брони мест не занимают', () => {
    expect(occupiesCapacity(cancelled())).toBe(false);
    expect(occupiesCapacity(expiredTransfer())).toBe(false);
    expect(occupiesCapacity(awaitingTransfer())).toBe(true);
    expect(occupiesCapacity(paidConfirmed())).toBe(true);

    const hall = [multiTicket(10), cancelled({ ticketsCount: 5 }), expiredTransfer({ ticketsCount: 5 })];
    expect(sumOccupiedTickets(hall)).toBe(10);
  });

  it('зал не может быть продан сверх вместимости', () => {
    const sold = sumOccupiedTickets([multiTicket(50)]);
    expect(checkCapacity(sold, 1, THEATRE_CAPACITY).allowed).toBe(false);
  });

  it('счётчик билетов в форме не уходит выше серверного лимита на одну бронь', () => {
    // Иначе зритель набирает больше билетов, чем примет /api/create-booking,
    // и узнаёт об этом общей ошибкой уже после отправки.
    const modal = projectSource('src/components/ui/BookingModal/BookingModal.tsx');
    expect(modal).toContain('MAX_TICKETS_PER_BOOKING');
    expect(modal).toContain('Math.floor(seatsLeft / seatsPerTicket)');
    expect(projectSource('server/booking/booking.validation.ts'))
      .toContain('ticketsCount > MAX_TICKETS_PER_BOOKING');
  });
});
