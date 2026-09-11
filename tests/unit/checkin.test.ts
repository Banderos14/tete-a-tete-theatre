import { describe, it, expect } from 'vitest';
import { endpointSource, projectSource, screenSource, transactionBody } from '../helpers/serverSource.js';

const api  = endpointSource('api/checkin-ticket.ts');
// Экран проверки разложен на оболочку, хуки и карточку результата —
// правило проверяется по всему каталогу, а не по одному файлу.
const page = screenSource('src/pages/TicketCheckPage');

describe('/api/checkin-ticket: атомарность', () => {
  it('проверка и отметка выполняются одной транзакцией', () => {
    expect(api).toContain('runTransaction');
    const tx = transactionBody(api);
    // Чтение брони и запись статуса — внутри ОДНОЙ транзакции: репозиторий
    // получает саму ручку tx, а не делает отдельный запрос вне транзакции.
    expect(tx).toContain('findByTicketCode(tx,');
    expect(tx).toMatch(/status:\s*'attended'/);
    expect(projectSource('server/booking/booking.repository.ts')).toContain('tx.get(');
  });

  it('повторная отметка отклоняется по already_attended', () => {
    expect(api).toContain("refusal: 'already_attended'");
    expect(api).toMatch(/if \(status === 'attended'\)/);
  });

  it('отменённую бронь отметить нельзя', () => {
    expect(api).toContain("refusal: 'cancelled'");
  });

  it('неоплаченный билет нельзя отметить посещённым', () => {
    expect(api).toContain("refusal: 'not_paid'");
    expect(api).toMatch(/paymentStatus !== 'paid'/);
  });

  it('повторная отметка оплаты отклоняется', () => {
    expect(api).toContain("refusal: 'already_paid'");
  });

  it('требуется роль admin', () => {
    expect(api).toContain("role === 'admin'");
    expect(api).toContain("'Admin only'");
  });

  it('формат кода билета валидируется', () => {
    expect(api).toContain('TICKET_CODE_RE');
    expect(api).toMatch(/\^\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}\$/);
  });

  it('записывается, КТО и КОГДА отметил проход', () => {
    expect(api).toContain('attendedAt');
    expect(api).toContain('attendedBy');
  });

  it('отказ уходит клиенту как reason — контракт ответа не изменился', () => {
    // Сервис бросает conflict(message, refusal), а общий errorResponse
    // раскладывает это в { error, reason } — поле на проводе прежнее.
    expect(api).toMatch(/conflict\(outcome\.message, outcome\.refusal/);
    expect(api).toMatch(/reason: err\.reason/);
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
    expect(page).toContain("showRelevance === 'too_late'");
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
    // Важен состав зависимостей, а не их точный список: как только роль
    // дорезолвилась, эффект обязан перезапуститься и разобрать код из адреса.
    // Точное совпадение строки ломалось бы от любой безобидной правки.
    const deps = page.match(/\}, \[loading, isAdmin, ticketFromUrl[^\]]*\]\)/);
    expect(deps, 'эффект разбора кода из адреса не найден').not.toBeNull();
  });

  it('авторизованному без прав объясняется причина', () => {
    expect(page).toContain('нет прав на проверку билетов');
  });
});
