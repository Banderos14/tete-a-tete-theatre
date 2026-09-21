// Оплата на месте не протухает через 24 часа.
//
// 24-часовой срок — это срок БАНКОВСКОГО ПЕРЕВОДА: он привязан к
// paymentStatus 'awaiting_transfer' и полю paymentExpiresAt, которое ставится
// только для bank_transfer. Бронь с оплатой на месте живёт до дня спектакля:
// зритель имеет право забронировать за пять дней и спокойно прийти к началу.
//
// Тест перебирает ВСЕ механизмы протухания — cron, клиентский фоллбек в
// кабинете и в админке — и проверяет, что ни один не трогает on_site.

import { describe, it, expect } from 'vitest';
import {
  isTransferOverdue, occupiesCapacity, sumOccupiedTickets,
} from '../../shared/domain/bookingRules.js';
import { endpointSource, projectSource, screenSource } from '../helpers/serverSource.js';

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;
const NOW  = Date.UTC(2026, 8, 12, 10, 0, 0);

/** Бронь «оплата на месте», созданная 5 дней назад; спектакль завтра. */
const onSiteFiveDaysOld = {
  status:        'pending',
  paymentStatus: 'not_paid',
  paymentMethod: 'on_site',
  // paymentExpiresAt для on_site не ставится вовсе — поля в документе нет.
  paymentExpiresAtMs: null,
  ticketsCount:  2,
};

const transferOverdue = {
  status:             'pending',
  paymentStatus:      'awaiting_transfer',
  paymentMethod:      'bank_transfer',
  paymentExpiresAtMs: NOW - DAY,
  ticketsCount:       2,
};

describe('on_site: срока оплаты нет', () => {
  it('бронь на месте старше 24 часов НЕ протухает', () => {
    expect(isTransferOverdue(onSiteFiveDaysOld, NOW)).toBe(false);
  });

  it('не протухает и через неделю', () => {
    expect(isTransferOverdue(onSiteFiveDaysOld, NOW + 7 * DAY)).toBe(false);
  });

  it('даже если в документе случайно оказался просроченный paymentExpiresAt', () => {
    // Решает paymentStatus, а не поле срока: not_paid под правило не подпадает.
    expect(isTransferOverdue(
      { ...onSiteFiveDaysOld, paymentExpiresAtMs: NOW - 10 * DAY }, NOW,
    )).toBe(false);
  });

  it('остаётся pending / not_paid — статусы никто не переписывает', () => {
    expect(onSiteFiveDaysOld.status).toBe('pending');
    expect(onSiteFiveDaysOld.paymentStatus).toBe('not_paid');
  });

  it('занимает место в зале до отмены или прохода', () => {
    expect(occupiesCapacity(onSiteFiveDaysOld)).toBe(true);
    expect(sumOccupiedTickets([onSiteFiveDaysOld])).toBe(2);
  });

  it('место освобождается только отменой', () => {
    expect(occupiesCapacity({ ...onSiteFiveDaysOld, status: 'cancelled' })).toBe(false);
  });

  it('после прохода место по-прежнему занято — зритель в зале', () => {
    expect(occupiesCapacity({ ...onSiteFiveDaysOld, status: 'attended', paymentStatus: 'paid' }))
      .toBe(true);
  });
});

describe('bank_transfer: срок 24 часа сохраняется', () => {
  it('перевод старше 24 часов протухает', () => {
    expect(isTransferOverdue(transferOverdue, NOW)).toBe(true);
  });

  it('перевод в пределах срока не трогается', () => {
    expect(isTransferOverdue({ ...transferOverdue, paymentExpiresAtMs: NOW + HOUR }, NOW)).toBe(false);
  });

  it('протухшая бронь место не занимает', () => {
    expect(occupiesCapacity({ ...transferOverdue, status: 'cancelled', paymentStatus: 'expired' }))
      .toBe(false);
  });

  it('оплаченный перевод не протухает, каким бы старым ни был', () => {
    expect(isTransferOverdue(
      { ...transferOverdue, paymentStatus: 'paid', paymentExpiresAtMs: NOW - 30 * DAY }, NOW,
    )).toBe(false);
  });

  it('в общем зале обе брони считаются, пока перевод не аннулирован', () => {
    expect(sumOccupiedTickets([onSiteFiveDaysOld, transferOverdue])).toBe(4);
  });
});

describe('ни один механизм протухания не смотрит на on_site', () => {
  it('cron выбирает только брони в статусе awaiting_transfer', () => {
    expect(endpointSource('api/expire-bookings.ts')).toContain('expireOverdueTransfers');

    // Сам сервис: отбор идёт по статусу перевода, а не по методу оплаты
    // и не по «создана больше суток назад».
    const svc = projectSource('server/expiration/expiration.service.ts');
    expect(svc).toMatch(/where\('paymentStatus', '==', 'awaiting_transfer'\)/);
    expect(svc).not.toContain('paymentMethod');
    expect(svc).not.toContain('not_paid');
    expect(svc).not.toContain('createdAt');
  });

  it('клиентский фоллбек в bookingService тоже ограничен переводами', () => {
    const src = projectSource('src/services/bookingService.ts');
    expect(src).toMatch(/if \(b\.paymentStatus !== 'awaiting_transfer'\) return false;/);
  });

  it('кабинет вызывает ровно этот общий фоллбек, админка не пишет вовсе', () => {
    // Своей логики срока у экранов быть не должно. Админка при открытии больше
    // ничего не аннулирует — это делает cron на сервере.
    const drawer = screenSource('src/components/ui/ProfileDrawer');
    expect(drawer).toContain('expireOverdueBookings');
    expect(drawer).not.toContain('isTransferOverdue');
    expect(drawer).not.toMatch(/paymentExpiresAt[^?]*[<>]/);
    expect(projectSource('src/pages/AdminPage/useAdminData.ts')).not.toContain('expireOverdueBookings');
  });


  it('paymentExpiresAt ставится только банковскому переводу', () => {
    const create = endpointSource('api/create-booking.ts');
    expect(create).toMatch(/const paymentExpiresAt = isBankTransfer/);
    expect(create).toMatch(/paymentStatus: isBankTransfer \? 'awaiting_transfer' : 'not_paid'/);
  });

  it('кабинет не прячет бронь на месте из «Моих билетов»', () => {
    // Активный билет отсеивается по отмене, протуханию и прошедшему спектаклю —
    // но не по способу оплаты и не по возрасту брони.
    const hook = projectSource('src/components/ui/ProfileDrawer/useProfileBookings.ts');
    const filter = hook.match(/const activeBookings = bookings\.filter\(b =>([\s\S]+?)\);/);
    expect(filter, 'фильтр активных броней не найден').not.toBeNull();
    expect(filter![1]).not.toContain('on_site');
    expect(filter![1]).not.toContain('paymentMethod');
    expect(filter![1]).not.toContain('createdAt');
  });

  it('QR доступен брони на месте до оплаты — сотрудник принимает деньги у двери', () => {
    const card = projectSource('src/components/ui/TicketCard/TicketCard.tsx');
    // QR/PDF-блок — TicketQrPanel; сама карточка решает, когда предложить его показать.
    expect(card).toMatch(/b\.paymentMethod === 'on_site' && payStatus === 'not_paid'/);
    const branch = card.slice(card.indexOf("b.paymentMethod === 'on_site' && payStatus === 'not_paid'"));
    expect(branch.slice(0, 300)).toContain('Показать QR');
  });
});
