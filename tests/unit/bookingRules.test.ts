import { describe, it, expect } from 'vitest';
import {
  canUserCancel,
  occupiesCapacity,
  isTransferOverdue,
  isValidCancelReason,
} from '../../api/_lib/bookingRules.js';

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
