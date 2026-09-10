import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const api  = readFileSync(resolve(ROOT, 'api/checkin-ticket.ts'), 'utf8');
const page = readFileSync(resolve(ROOT, 'src/pages/TicketCheckPage/TicketCheckPage.tsx'), 'utf8');

describe('/api/checkin-ticket: атомарность', () => {
  it('проверка и отметка выполняются одной транзакцией', () => {
    expect(api).toContain('runTransaction');
    const txStart = api.indexOf('runTransaction');
    const txEnd   = api.indexOf('} catch (err) {', txStart);
    const tx      = api.slice(txStart, txEnd);
    // чтение брони и запись статуса — внутри одной транзакции
    expect(tx).toContain("tx.get(");
    expect(tx).toContain("status:       'attended'");
  });

  it('повторная отметка отклоняется по already_attended', () => {
    expect(api).toContain("reason: 'already_attended'");
    expect(api).toMatch(/if \(status === 'attended'\)/);
  });

  it('отменённую бронь отметить нельзя', () => {
    expect(api).toContain("reason: 'cancelled'");
  });

  it('неоплаченный билет нельзя отметить посещённым', () => {
    expect(api).toContain("reason: 'not_paid'");
    expect(api).toMatch(/paymentStatus !== 'paid'/);
  });

  it('повторная отметка оплаты отклоняется', () => {
    expect(api).toContain("reason: 'already_paid'");
  });

  it('требуется роль admin', () => {
    expect(api).toContain("role === 'admin'");
    expect(api).toContain("error: 'Admin only'");
  });

  it('формат кода билета валидируется', () => {
    expect(api).toContain('TICKET_CODE_RE');
    expect(api).toMatch(/\^\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}\$/);
  });

  it('записывается, КТО и КОГДА отметил проход', () => {
    expect(api).toContain('attendedAt');
    expect(api).toContain('attendedBy');
  });

  it('оплата наличными на входе ставит и paid, и confirmed одной записью', () => {
    expect(api).toMatch(/paymentStatus: 'paid',\s*\n\s*status:\s*'confirmed'/);
  });
});

describe('релевантность даты спектакля', () => {
  it('сервер считает актуальность спектакля', () => {
    expect(api).toContain('showRelevance');
    expect(api).toContain("'too_early'");
    expect(api).toContain("'too_late'");
  });

  it('билет прошедшего спектакля не считается действительным', () => {
    expect(page).toContain("b?.showRelevance === 'too_late'");
    expect(page).toContain('Билет на прошедший спектакль');
  });

  it('билет на будущую дату помечается предупреждением', () => {
    expect(page).toContain('isEarlyShow');
    expect(page).toContain('Билет на другую дату');
  });
});

describe('страница проверки больше не пишет в Firestore напрямую', () => {
  it('прямых updateDoc-хелперов на странице нет', () => {
    expect(page).not.toContain('updateBookingStatus');
    expect(page).not.toContain('markBookingPaid');
    expect(page).not.toContain('getBookingByTicketCode');
  });

  it('все операции идут через серверный endpoint', () => {
    expect(page).toContain('checkinTicket');
    expect(page).toContain("'mark_attended'");
    expect(page).toContain("'mark_paid'");
    expect(page).toContain("'inspect'");
  });

  it('повторное нажатие во время операции отсекается', () => {
    expect(page).toContain('if (!booking || operating) return;');
  });
});

describe('TTT-16: код билета не теряется при отсутствии admin-сессии', () => {
  it('редиректа на главную нет, если в адресе есть ticket', () => {
    expect(page).toContain('if (!isAdmin && !ticketFromUrl)');
  });

  it('на странице показывается вход, а не только отказ', () => {
    expect(page).toContain('handleSignIn');
    expect(page).toContain('handleGoogleSignIn');
    expect(page).toContain('signInWithEmail');
  });

  it('отсканированный код показывается пользователю', () => {
    expect(page).toContain('scannedCode');
    expect(page).toContain('распознан');
  });

  it('после входа проверка продолжается сама — эффект зависит от isAdmin', () => {
    expect(page).toMatch(/\}, \[loading, isAdmin, ticketFromUrl\]\)/);
  });

  it('авторизованному без прав объясняется причина', () => {
    expect(page).toContain('нет прав на проверку билетов');
  });
});
