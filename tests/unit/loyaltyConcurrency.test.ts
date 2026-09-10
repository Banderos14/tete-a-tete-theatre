import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hasAvailableLoyaltyReward, getUserAttendedCount, getUsedRewardCount, calculateLoyaltyDiscount,
} from '../../src/services/loyaltyService.js';
import type { Booking } from '../../src/types/booking.js';

const ROOT = resolve(__dirname, '../..');
const api  = readFileSync(resolve(ROOT, 'api/create-booking.ts'), 'utf8');

// Минимальная бронь для расчёта лояльности.
function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'x', showId: 'nulin', showTitle: '', showDate: '14 Июн 2020', showTime: '19:00',
    userId: 'u', userName: '', userEmail: '', userPhone: '',
    ticketsCount: 1, ticketType: 'standard', priceInfo: '', totalAmount: 30, ticketCode: 'AAAA-BBBB',
    status: 'attended', paymentMethod: 'on_site', paymentStatus: 'paid', comment: '',
    createdAt: undefined as never, ...over,
  } as Booking;
}

describe('правила лояльности', () => {
  it('до пяти посещений бонуса нет', () => {
    const list = Array.from({ length: 4 }, () => booking());
    expect(getUserAttendedCount(list)).toBe(4);
    expect(hasAvailableLoyaltyReward(list)).toBe(false);
  });

  it('пять посещений дают один бонус', () => {
    const list = Array.from({ length: 5 }, () => booking());
    expect(hasAvailableLoyaltyReward(list)).toBe(true);
  });

  it('израсходованный бонус больше не доступен', () => {
    const list = [
      ...Array.from({ length: 5 }, () => booking()),
      booking({ status: 'pending', paymentStatus: 'not_paid', loyaltyDiscountApplied: true }),
    ];
    expect(getUsedRewardCount(list)).toBe(1);
    expect(hasAvailableLoyaltyReward(list)).toBe(false);
  });

  it('десять посещений и один потраченный бонус дают второй', () => {
    const list = [
      ...Array.from({ length: 10 }, () => booking()),
      booking({ status: 'pending', paymentStatus: 'not_paid', loyaltyDiscountApplied: true }),
    ];
    expect(hasAvailableLoyaltyReward(list)).toBe(true);
  });

  it('скидка 50 % с округлением вниз', () => {
    expect(calculateLoyaltyDiscount(30)).toBe(15);
    expect(calculateLoyaltyDiscount(45)).toBe(22);
    expect(calculateLoyaltyDiscount(0)).toBe(0);
  });
});

describe('бонус нельзя потратить дважды параллельно', () => {
  it('расчёт и списание бонуса происходят внутри одной транзакции', () => {
    const txStart = api.indexOf('runTransaction');
    const txEnd   = api.indexOf('} catch (err) {', txStart);
    const tx      = api.slice(txStart, txEnd);
    expect(tx).toContain('computeLoyalty(');
    expect(tx).toContain('tx.set(loyaltyRef');
    expect(tx).toContain('tx.create(bookingRef');
  });

  it('есть документ-точка конфликта на пользователя', () => {
    expect(api).toContain("db.collection('loyaltyState').doc(uid)");
    expect(api).toContain('await tx.get(loyaltyRef)');
  });

  it('документ лояльности пишется ВСЕГДА — даже без скидки', () => {
    // Иначе две параллельные брони одного пользователя не конфликтовали бы.
    expect(api).toMatch(/\} else \{[\s\S]{0,220}tx\.set\(loyaltyRef/);
  });

  it('израсходованные бонусы берутся как максимум счётчика и истории', () => {
    expect(api).toContain('Math.max(usedFromHist, usedFromState)');
  });

  it('есть документ-точка конфликта на спектакль', () => {
    expect(api).toContain("db.collection('showCounters').doc(showId)");
    expect(api).toContain('await tx.get(showCounterRef)');
  });

  it('все чтения транзакции идут до всех записей', () => {
    const txStart = api.indexOf('runTransaction');
    const txEnd   = api.indexOf('} catch (err) {', txStart);
    const tx      = api.slice(txStart, txEnd);
    const lastGet   = Math.max(tx.lastIndexOf('await tx.get('), tx.lastIndexOf('readSoldTickets('));
    const firstWrite = Math.min(
      ...['tx.set(', 'tx.create(', 'tx.update('].map(w => {
        const i = tx.indexOf(w);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    expect(lastGet).toBeLessThan(firstWrite);
  });
});
