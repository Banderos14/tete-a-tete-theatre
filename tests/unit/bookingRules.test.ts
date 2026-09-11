import { describe, it, expect } from 'vitest';
import {
  canUserCancel,
  occupiesCapacity,
  isTransferOverdue,
  isValidCancelReason,
} from '../../shared/domain/bookingRules.js';

const FUTURE = Date.UTC(2030, 0, 1);
const NOW    = Date.UTC(2026, 0, 1);

describe('canUserCancel — бизнес-правила отмены зрителем', () => {
  it('разрешает отменить неоплаченную бронь с оплатой на месте', () => {
    const d = canUserCancel(
      { status: 'pending', paymentStatus: 'not_paid', paymentMethod: 'on_site' }, FUTURE, NOW,
    );
    expect(d.allowed).toBe(true);
  });

  it('разрешает отменить бронь, ожидающую перевода', () => {
    const d = canUserCancel(
      { status: 'pending', paymentStatus: 'awaiting_transfer', paymentMethod: 'bank_transfer' }, FUTURE, NOW,
    );
    expect(d.allowed).toBe(true);
  });

  it('ЗАПРЕЩАЕТ отменить оплаченную бронь', () => {
    const d = canUserCancel(
      { status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'bank_transfer' }, FUTURE, NOW,
    );
    expect(d).toEqual({ allowed: false, reason: 'already_paid' });
  });

  it('ЗАПРЕЩАЕТ отменить оплаченную бронь даже если статус ещё pending', () => {
    const d = canUserCancel({ status: 'pending', paymentStatus: 'paid' }, FUTURE, NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('already_paid');
  });

  it('запрещает отменить посещённую бронь', () => {
    const d = canUserCancel({ status: 'attended', paymentStatus: 'paid' }, FUTURE, NOW);
    expect(d.reason).toBe('already_attended');
  });

  it('запрещает повторную отмену', () => {
    const d = canUserCancel({ status: 'cancelled', paymentStatus: 'not_paid' }, FUTURE, NOW);
    expect(d.reason).toBe('already_cancelled');
  });

  it('запрещает отмену после начала спектакля', () => {
    const started = NOW - 1000;
    const d = canUserCancel({ status: 'pending', paymentStatus: 'not_paid' }, started, NOW);
    expect(d.reason).toBe('show_started');
  });

  it('разрешает отмену ровно за миллисекунду до начала', () => {
    expect(canUserCancel({ status: 'pending', paymentStatus: 'not_paid' }, NOW + 1, NOW).allowed).toBe(true);
  });

  it('не падает, если время спектакля неизвестно', () => {
    expect(canUserCancel({ status: 'pending', paymentStatus: 'not_paid' }, null, NOW).allowed).toBe(true);
  });
});

describe('occupiesCapacity', () => {
  it('активная бронь занимает место', () => {
    expect(occupiesCapacity({ status: 'pending',   paymentStatus: 'not_paid' })).toBe(true);
    expect(occupiesCapacity({ status: 'confirmed', paymentStatus: 'paid' })).toBe(true);
    expect(occupiesCapacity({ status: 'attended',  paymentStatus: 'paid' })).toBe(true);
    expect(occupiesCapacity({ status: 'pending',   paymentStatus: 'awaiting_transfer' })).toBe(true);
  });

  it('отменённая и протухшая бронь место НЕ занимает', () => {
    expect(occupiesCapacity({ status: 'cancelled', paymentStatus: 'not_paid' })).toBe(false);
    expect(occupiesCapacity({ status: 'cancelled', paymentStatus: 'expired' })).toBe(false);
    expect(occupiesCapacity({ status: 'pending',   paymentStatus: 'expired' })).toBe(false);
  });
});

describe('isTransferOverdue', () => {
  it('истёкший перевод распознаётся', () => {
    expect(isTransferOverdue(
      { status: 'pending', paymentStatus: 'awaiting_transfer', paymentExpiresAtMs: NOW - 1 }, NOW,
    )).toBe(true);
  });

  it('ещё не истёкший — нет', () => {
    expect(isTransferOverdue(
      { status: 'pending', paymentStatus: 'awaiting_transfer', paymentExpiresAtMs: NOW + 1 }, NOW,
    )).toBe(false);
  });

  it('уже отменённые и оплаченные не трогаем', () => {
    expect(isTransferOverdue(
      { status: 'cancelled', paymentStatus: 'awaiting_transfer', paymentExpiresAtMs: NOW - 1 }, NOW,
    )).toBe(false);
    expect(isTransferOverdue(
      { status: 'confirmed', paymentStatus: 'paid', paymentExpiresAtMs: NOW - 1 }, NOW,
    )).toBe(false);
  });
});

describe('isValidCancelReason', () => {
  it('принимает причины из интерфейса кабинета', () => {
    for (const r of ['time', 'plans', 'mistake', 'other']) expect(isValidCancelReason(r)).toBe(true);
  });
  it('отклоняет прочее', () => {
    for (const r of ['', 'hack', null, 42, undefined]) expect(isValidCancelReason(r)).toBe(false);
  });
});

// ── Раздел 5: защита от бессмысленных состояний у администратора ────────────
import { describeStateIssue } from '../../shared/domain/bookingRules.js';

describe('describeStateIssue', () => {
  it('ловит attended без оплаты — пример из задания', () => {
    expect(describeStateIssue('attended', 'not_paid')).toMatch(/посещённая, но не оплачена/);
    expect(describeStateIssue('attended', 'awaiting_transfer')).not.toBeNull();
    expect(describeStateIssue('attended', 'expired')).not.toBeNull();
  });

  it('ловит подтверждение при истёкшей оплате', () => {
    expect(describeStateIssue('confirmed', 'expired')).not.toBeNull();
  });

  it('ловит отменённую, но оплаченную бронь — возврат придётся делать вручную', () => {
    expect(describeStateIssue('cancelled', 'paid')).toMatch(/вернуть вручную/);
  });

  it('ловит подтверждение до получения перевода', () => {
    expect(describeStateIssue('confirmed', 'awaiting_transfer')).not.toBeNull();
  });

  it('нормальные сочетания проходят молча', () => {
    expect(describeStateIssue('attended', 'paid')).toBeNull();
    expect(describeStateIssue('confirmed', 'paid')).toBeNull();
    expect(describeStateIssue('pending', 'not_paid')).toBeNull();
    expect(describeStateIssue('pending', 'awaiting_transfer')).toBeNull();
    expect(describeStateIssue('cancelled', 'expired')).toBeNull();
    expect(describeStateIssue('cancelled', 'not_paid')).toBeNull();
  });

  it('это предупреждение, а не запрет — админка спрашивает подтверждение', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const admin = readFileSync(resolve(__dirname, '../../src/pages/AdminPage/AdminPage.tsx'), 'utf8');
    expect(admin).toContain('describeStateIssue');
    expect(admin).toContain('Всё равно сохранить?');
  });
});
