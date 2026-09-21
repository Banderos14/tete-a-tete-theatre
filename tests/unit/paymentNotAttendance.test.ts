import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { functionBody, projectSource, transactionBody } from '../helpers/serverSource.js';
import { isBookingAttended } from '../../shared/domain/bookingRules.js';

// ОПЛАТА НЕ ОЗНАЧАЕТ ПОСЕЩЕНИЕ.
//
// Регрессия, ради которой написан файл: правило посещаемости выводило
// «посещено» из «confirmed + paid + спектакль закончился», а админка при
// каждой загрузке записывала этот вывод в Firestore. Оплаченная бронь зрителя,
// который не пришёл, задним числом становилась посещённой.

const ROOT = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('оплата переводит бронь в confirmed, а не в attended', () => {
  it('mark_paid на входе ставит confirmed', () => {
    // Поля перехода — общий хелпер одиночного и группового прохода.
    const service = projectSource('server/checkin/checkin.service.ts');
    expect(transactionBody(projectSource('server/checkin/checkin.service.ts'))).toContain('paidTransition(input.adminUid)');
    expect(functionBody(service, 'paidTransition'))
      .toMatch(/paymentStatus:\s*'paid',\s*\n\s*status:\s*'confirmed'/);
  });

  it('ветка mark_paid вообще не пишет attended', () => {
    const service = projectSource('server/checkin/checkin.service.ts');
    // Всё, что идёт после комментария про оплату наличными, — ветка mark_paid.
    const markPaidBranch = service.slice(service.indexOf('// mark_paid'));
    expect(markPaidBranch).not.toMatch(/status:\s*'attended'/);
  });

  it('админская отметка оплаты — то же серверное действие mark_paid, без посещения', () => {
    // Админка больше не пишет в Firestore: «Оплачено» — это mark_paid на сервере.
    const hook = projectSource('src/pages/AdminPage/useAdminData.ts');
    expect(hook).toContain("action: 'mark_paid'");
    expect(hook).not.toContain('updateDoc');
  });

  it('снятие оплаты меняет только оплату и её аудит', () => {
    const fn = functionBody(projectSource('server/booking/admin.service.ts'), 'markUnpaidByAdmin');
    expect(fn).toContain("paymentStatus: 'not_paid'");
    expect(fn).not.toMatch(/\bstatus:\s*'/);
  });
});

describe('attended появляется только после check-in', () => {
  it('на сервере attended пишет только сервис check-in', () => {
    const writers = [...walk(join(ROOT, 'server')), ...walk(join(ROOT, 'api'))]
      .filter(f => /status:\s*'attended'/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(ROOT.length + 1));
    expect(writers).toEqual(['server/checkin/checkin.service.ts']);
  });

  it('клиент не отправляет attended в Firestore', () => {
    // В src упоминание attended допустимо только как локальный стейт и как
    // отображение: запись статуса — исключительно серверная операция.
    // (useTicketCheck зеркалит отказ already_attended в своём стейте.)
    const offenders = walk(join(ROOT, 'src'))
      .map(f => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')] as const)
      .filter(([, src]) =>
        /updateDoc\([\s\S]{0,200}'attended'/.test(src) ||
        /updateBookingStatus\([^)]*'attended'/.test(src))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('запись сопровождается следом проверяющего — кто и когда пропустил', () => {
    const service = projectSource('server/checkin/checkin.service.ts');
    expect(transactionBody(projectSource('server/checkin/checkin.service.ts'))).toContain('attendedTransition(input.adminUid)');
    const fields = functionBody(service, 'attendedTransition');
    expect(fields).toMatch(/status:\s*'attended'/);
    expect(fields).toContain('attendedAt');
    expect(fields).toContain('attendedBy');
  });

  it('админка больше не проставляет посещение пачкой при загрузке', () => {
    // Источник регрессии: markEligibleBookingsAsAttended вызывался в fetchAll.
    const svc  = projectSource('src/services/bookingService.ts');
    const hook = projectSource('src/pages/AdminPage/useAdminData.ts');
    expect(svc).not.toContain('markEligibleBookingsAsAttended');
    expect(hook).not.toContain('markEligibleBookingsAsAttended');
  });

  it('правило посещаемости не смотрит на оплату и на время спектакля', () => {
    const rules = projectSource('shared/domain/bookingRules.ts');
    const fn = rules.slice(rules.indexOf('export function isBookingAttended'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toContain('paymentStatus');
    expect(body).not.toContain('showEndUtcMs');
  });
});

describe('переходы статуса при оплате', () => {
  it('оплата → confirmed, и это не посещение', () => {
    const paid = { status: 'confirmed', paymentStatus: 'paid' } as const;
    expect(paid.status).toBe('confirmed');
    expect(isBookingAttended(paid)).toBe(false);
  });

  it('только check-in даёт attended', () => {
    expect(isBookingAttended({ status: 'attended', paymentStatus: 'paid' })).toBe(true);
  });

  it('отменённая бронь не становится посещённой из-за оплаты', () => {
    expect(isBookingAttended({ status: 'cancelled', paymentStatus: 'paid' })).toBe(false);
  });

  it('check-in отказывает в проходе по отменённой броне', () => {
    const service = projectSource('server/checkin/checkin.service.ts');
    const branch = service.slice(
      service.indexOf("if (action === 'mark_attended')"),
      service.indexOf('// mark_paid'),
    );
    expect(branch).toMatch(/status === 'cancelled'[\s\S]{0,120}refusal: 'cancelled'/);
    expect(branch).toMatch(/paymentStatus !== 'paid'[\s\S]{0,120}refusal: 'not_paid'/);
  });
});

describe('кабинет зрителя: прошедший спектакль не остаётся активным билетом', () => {
  it('активный список отсекает прошедшие спектакли по календарю', () => {
    // Раньше прошедшие уходили из «активных» потому, что оплата считалась
    // посещением. Теперь посещение ставит только check-in, поэтому дату
    // приходится проверять явно — иначе список не очищался бы никогда.
    const hook = projectSource('src/components/ui/ProfileDrawer/useProfileBookings.ts');
    expect(hook).toContain('isShowOver');
    expect(hook).toMatch(/activeBookings = bookings\.filter\([\s\S]{0,200}!isShowOver\(b\)/);
  });

  it('«прошёл спектакль» и «зритель пришёл» — разные проверки', () => {
    const svc = projectSource('src/services/attendanceService.ts');
    // isShowOver про календарь, computedIsAttended про факт прохода.
    const isShowOverFn = svc.slice(svc.indexOf('export function isShowOver'));
    expect(isShowOverFn).not.toContain('paymentStatus');
    expect(isShowOverFn).not.toContain('isBookingAttended');

    const attendedFn = svc.slice(
      svc.indexOf('export function computedIsAttended'),
      svc.indexOf('function bookingStartUtcMs'),
    );
    expect(attendedFn).not.toContain('showEndUtcMs');
  });
});

describe('лояльность считает приходы, а не платежи', () => {
  it('расчёт бонуса опирается на тот же isBookingAttended', () => {
    // Сервер и кабинет считают по одному правилу; посещение — только проход.
    expect(projectSource('server/booking/loyalty.ts')).toContain('loyaltySummary(');
    expect(projectSource('shared/domain/loyalty.ts')).toContain('isBookingAttended(b)');
  });
});
