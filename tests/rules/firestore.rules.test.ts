import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, Timestamp,
} from 'firebase/firestore';

// Тесты правил безопасности Firestore.
//
// Требуют эмулятор: npm run test:rules
// (внутри поднимается `firebase emulators:exec --only firestore`, нужна Java).
//
// Проверяем именно ГРАНИЦУ БЕЗОПАСНОСТИ, а не интерфейс: что обычный
// пользователь может и, главное, чего не может сделать в обход приложения —
// например, напрямую через SDK из консоли браузера.

let testEnv: RulesTestEnvironment;

const USER_A = 'user-a';
const USER_B = 'user-b';
const ADMIN  = 'admin-1';

const PAST   = Timestamp.fromMillis(Date.now() - 60_000);
const FUTURE = Timestamp.fromMillis(Date.now() + 60 * 60_000);

function baseBooking(userId: string, over: Record<string, unknown> = {}) {
  return {
    showId: 'nulin', showTitle: '«Граф Нулин»', showDate: '12 Июл 2026', showTime: '20:00',
    userId, userName: 'Тест', userEmail: 't@example.com', userPhone: '+33749661940',
    ticketsCount: 2, ticketType: 'standard', priceInfo: '', totalAmount: 60,
    ticketCode: 'ABCD-2345', status: 'pending', paymentMethod: 'on_site',
    paymentStatus: 'not_paid', comment: '', lang: 'RU',
    ...over,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'ttt-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Заполняем данные в обход правил — это разрешённый способ подготовки.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', USER_A), { displayName: 'A', email: 'a@example.com', role: 'user' });
    await setDoc(doc(db, 'users', USER_B), { displayName: 'B', email: 'b@example.com', role: 'user' });
    await setDoc(doc(db, 'users', ADMIN),  { displayName: 'Admin', email: 'admin@example.com', role: 'admin' });

    await setDoc(doc(db, 'bookings', 'a-pending'),  baseBooking(USER_A));
    await setDoc(doc(db, 'bookings', 'a-paid'),     baseBooking(USER_A, { status: 'confirmed', paymentStatus: 'paid' }));
    await setDoc(doc(db, 'bookings', 'a-overdue'),  baseBooking(USER_A, {
      paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer', paymentExpiresAt: PAST,
    }));
    await setDoc(doc(db, 'bookings', 'a-waiting'),  baseBooking(USER_A, {
      paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer', paymentExpiresAt: FUTURE,
    }));
    await setDoc(doc(db, 'bookings', 'b-pending'),  baseBooking(USER_B));
    // Онлайн-оплата с истёкшим сроком: протухать её может только сервер после
    // сверки со Stripe — сессия могла быть оплачена.
    await setDoc(doc(db, 'bookings', 'a-online-overdue'), baseBooking(USER_A, {
      paymentMethod: 'online', paymentStatus: 'awaiting_online', paymentExpiresAt: PAST,
      stripeCheckoutSessionId: 'cs_test_1',
    }));
    await setDoc(doc(db, 'bookings', 'a-online-waiting'), baseBooking(USER_A, {
      paymentMethod: 'online', paymentStatus: 'awaiting_online', paymentExpiresAt: FUTURE,
      stripeCheckoutSessionId: 'cs_test_2',
    }));
    await setDoc(doc(db, 'bookings', 'a-online-paid'), baseBooking(USER_A, {
      paymentMethod: 'online', paymentStatus: 'paid', status: 'confirmed',
      stripeCheckoutSessionId: 'cs_test_3', stripePaymentIntentId: 'pi_test_3',
    }));
    await setDoc(doc(db, 'bookings', 'a-online-issue'), baseBooking(USER_A, {
      paymentMethod: 'online', paymentStatus: 'paid', status: 'cancelled',
      stripeCheckoutSessionId: 'cs_test_4', stripePaymentIntentId: 'pi_test_4',
      paymentIssue: 'paid_after_cancel',
    }));

    await setDoc(doc(db, 'stats', 'siteStats'), { audienceCount: 2500 });
    await setDoc(doc(db, 'showCounters', 'nulin'), { lastKnownSoldTickets: 10 });
    await setDoc(doc(db, 'loyaltyState', USER_A), { rewardsUsed: 0 });
  });
});

const asUserA = () => testEnv.authenticatedContext(USER_A).firestore();
const asUserB = () => testEnv.authenticatedContext(USER_B).firestore();
const asAdmin = () => testEnv.authenticatedContext(ADMIN).firestore();
const asAnon  = () => testEnv.unauthenticatedContext().firestore();

describe('users', () => {
  it('пользователь читает свой профиль', async () => {
    await assertSucceeds(getDoc(doc(asUserA(), 'users', USER_A)));
  });

  it('пользователь НЕ читает чужой профиль', async () => {
    await assertFails(getDoc(doc(asUserA(), 'users', USER_B)));
  });

  it('пользователь НЕ может сделать себя администратором', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'users', USER_A), { role: 'admin' }));
  });

  it('пользователь НЕ может создать профиль сразу с ролью admin', async () => {
    const db = testEnv.authenticatedContext('fresh-user').firestore();
    await assertFails(setDoc(doc(db, 'users', 'fresh-user'), { role: 'admin' }));
  });

  it('пользователь создаёт свой профиль с ролью user', async () => {
    const db = testEnv.authenticatedContext('fresh-user').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'fresh-user'), { role: 'user', displayName: 'Новый' }));
  });

  it('пользователь меняет своё имя, не трогая роль', async () => {
    await assertSucceeds(updateDoc(doc(asUserA(), 'users', USER_A), { displayName: 'Новое имя', role: 'user' }));
  });

  it('пользователь НЕ может изменить чужой профиль', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'users', USER_B), { displayName: 'Взлом' }));
  });

  it('пользователь НЕ может удалить свой профиль напрямую', async () => {
    await assertFails(deleteDoc(doc(asUserA(), 'users', USER_A)));
  });

  it('администратор читает любой профиль', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', USER_A)));
  });

  it('администратор может менять роль', async () => {
    await assertSucceeds(updateDoc(doc(asAdmin(), 'users', USER_A), { role: 'admin' }));
  });

  it('анонимный НЕ читает профили', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', USER_A)));
  });
});

describe('bookings — чтение', () => {
  it('пользователь читает свою бронь', async () => {
    await assertSucceeds(getDoc(doc(asUserA(), 'bookings', 'a-pending')));
  });

  it('пользователь НЕ читает чужую бронь', async () => {
    await assertFails(getDoc(doc(asUserA(), 'bookings', 'b-pending')));
  });

  it('и наоборот — второй пользователь не читает бронь первого', async () => {
    await assertFails(getDoc(doc(asUserB(), 'bookings', 'a-pending')));
    await assertSucceeds(getDoc(doc(asUserB(), 'bookings', 'b-pending')));
  });

  it('запрос своих броней проходит', async () => {
    await assertSucceeds(getDocs(query(collection(asUserA(), 'bookings'), where('userId', '==', USER_A))));
  });

  it('запрос ВСЕХ броней отклоняется — иначе утекли бы чужие персональные данные', async () => {
    await assertFails(getDocs(collection(asUserA(), 'bookings')));
  });

  it('запрос по чужому userId отклоняется', async () => {
    await assertFails(getDocs(query(collection(asUserA(), 'bookings'), where('userId', '==', USER_B))));
  });

  it('поиск по коду билета обычному пользователю недоступен — нет оракула для перебора', async () => {
    await assertFails(getDocs(query(collection(asUserA(), 'bookings'), where('ticketCode', '==', 'ABCD-2345'))));
  });

  it('анонимный не читает брони', async () => {
    await assertFails(getDoc(doc(asAnon(), 'bookings', 'a-pending')));
  });

  it('администратор читает все брони', async () => {
    await assertSucceeds(getDocs(collection(asAdmin(), 'bookings')));
  });
});

describe('bookings — запись', () => {
  it('пользователь НЕ может создать бронь напрямую (цена задавалась бы клиентом)', async () => {
    await assertFails(setDoc(doc(asUserA(), 'bookings', 'forged'), baseBooking(USER_A, { totalAmount: 0 })));
  });

  it('пользователь НЕ может поставить себе paid', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-pending'), { paymentStatus: 'paid' }));
  });

  it('пользователь НЕ может поставить себе confirmed', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-pending'), { status: 'confirmed' }));
  });

  it('пользователь НЕ может отметить себя посетившим', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-paid'), { status: 'attended' }));
  });

  it('пользователь НЕ может изменить сумму', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-pending'), { totalAmount: 1 }));
  });

  it('пользователь НЕ может отменить бронь напрямую — только через /api/cancel-booking', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-pending'), {
      status: 'cancelled', cancelledBy: 'user', cancelReason: 'plans',
    }));
  });

  it('пользователь НЕ может изменить чужую бронь', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'b-pending'), { status: 'cancelled' }));
  });

  it('пользователь НЕ может удалить бронь', async () => {
    await assertFails(deleteDoc(doc(asUserA(), 'bookings', 'a-pending')));
  });

  it('разрешённый переход: протухший перевод можно перевести в expired', async () => {
    await assertSucceeds(updateDoc(doc(asUserA(), 'bookings', 'a-overdue'), {
      paymentStatus: 'expired', status: 'cancelled', updatedAt: Timestamp.now(),
    }));
  });

  it('тот же переход ДО истечения срока отклоняется', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-waiting'), {
      paymentStatus: 'expired', status: 'cancelled', updatedAt: Timestamp.now(),
    }));
  });

  it('онлайн-оплату клиент НЕ может протухнуть сам, даже после срока', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-overdue'), {
      paymentStatus: 'expired', status: 'cancelled', updatedAt: Timestamp.now(),
    }));
  });

  it('онлайн-оплату клиент НЕ может отметить оплаченной', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-overdue'), {
      paymentStatus: 'paid', status: 'confirmed', stripePaymentIntentId: 'pi_fake',
    }));
  });

  // Phase 6: статусы оплаты и возврата пишет только сервер (webhook Stripe,
  // сверка cron). Ни один из этих переходов браузер сделать не может.
  it('онлайн-оплату клиент НЕ может отметить протухшей до срока (своя бронь, awaiting_online)', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-waiting'), {
      paymentStatus: 'expired', status: 'cancelled', updatedAt: Timestamp.now(),
    }));
  });

  it('клиент НЕ может поставить refunded', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-paid'), {
      paymentStatus: 'refunded', status: 'cancelled',
    }));
  });

  it('клиент НЕ может записать статус возврата', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-paid'), {
      refund: { id: 're_fake', status: 'succeeded', amount: 60 },
    }));
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-paid'), {
      'refund.status': 'failed',
    }));
  });

  it('клиент НЕ может записать или подменить Stripe-идентификаторы', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-waiting'), { stripeCheckoutSessionId: 'cs_test_foreign' }));
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-paid'),    { stripePaymentIntentId: 'pi_foreign' }));
  });

  it('клиент НЕ может записать или снять paymentIssue', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-paid'), { paymentIssue: 'amount_mismatch' }));
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-issue'), { paymentIssue: null }));
  });

  it('клиент НЕ может сменить способ оплаты, чтобы попасть под правило протухания перевода', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-online-overdue'), {
      paymentMethod: 'bank_transfer', paymentStatus: 'awaiting_transfer',
    }));
  });

  it('протухание своего просроченного перевода с полями Stripe отклоняется', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-overdue'), {
      paymentStatus: 'expired', status: 'cancelled', stripePaymentIntentId: 'pi_x',
    }));
  });

  it('администратор тоже НЕ пишет возврат или Stripe-поля из браузера', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'bookings', 'a-online-paid'), {
      paymentStatus: 'refunded', status: 'cancelled', refund: { status: 'succeeded' },
    }));
    await assertFails(updateDoc(doc(asAdmin(), 'bookings', 'a-online-issue'), { paymentIssue: null }));
  });

  it('пользователь читает свою онлайн-бронь, но НЕ чужую', async () => {
    await assertSucceeds(getDoc(doc(asUserA(), 'bookings', 'a-online-paid')));
    await assertFails(getDoc(doc(asUserB(), 'bookings', 'a-online-paid')));
  });

  it('переход в expired с лишними полями отклоняется', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'bookings', 'a-overdue'), {
      paymentStatus: 'expired', status: 'cancelled', totalAmount: 0,
    }));
  });

  // Все изменения броней администратором идут через /api/admin-booking
  // (Admin SDK): браузер админа бронь только читает.
  it('администратор НЕ пишет оплату из браузера — только сервер', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'bookings', 'a-pending'), {
      paymentStatus: 'paid', status: 'confirmed',
    }));
  });

  it('администратор НЕ отмечает проход из браузера — только сервер', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'bookings', 'a-paid'), { status: 'attended' }));
  });

  it('администратор НЕ удаляет бронь из браузера — только сервер', async () => {
    await assertFails(deleteDoc(doc(asAdmin(), 'bookings', 'a-pending')));
  });

  it('даже администратор не создаёт бронь напрямую — только сервер', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'bookings', 'admin-made'), baseBooking(ADMIN)));
  });
});

describe('stats — публичный счётчик', () => {
  it('читает кто угодно, включая анонимного', async () => {
    await assertSucceeds(getDoc(doc(asAnon(), 'stats', 'siteStats')));
  });

  it('авторизованный НЕ может накрутить счётчик', async () => {
    await assertFails(updateDoc(doc(asUserA(), 'stats', 'siteStats'), { audienceCount: 2501 }));
  });

  it('авторизованный НЕ может создать произвольный документ статистики', async () => {
    await assertFails(setDoc(doc(asUserA(), 'stats', 'fake'), { audienceCount: 999999 }));
  });

  it('администратор тоже не пишет напрямую — счётчик меняет только сервер', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'stats', 'siteStats'), { audienceCount: 1 }));
  });
});

describe('служебные серверные коллекции закрыты полностью', () => {
  const collections = ['showCounters', 'loyaltyState', 'idempotencyKeys', 'rateLimits', 'audienceCounted', 'emailLog'];

  for (const name of collections) {
    it(`${name}: пользователь не читает`, async () => {
      await assertFails(getDoc(doc(asUserA(), name, 'nulin')));
    });

    it(`${name}: пользователь не пишет`, async () => {
      await assertFails(setDoc(doc(asUserA(), name, 'nulin'), { x: 1 }));
    });

    it(`${name}: администратор тоже не пишет`, async () => {
      await assertFails(setDoc(doc(asAdmin(), name, 'nulin'), { x: 1 }));
    });
  }
});

describe('коллекции, которых нет в правилах, закрыты по умолчанию', () => {
  it('произвольная коллекция недоступна на чтение и запись', async () => {
    await assertFails(getDoc(doc(asUserA(), 'somethingElse', 'x')));
    await assertFails(setDoc(doc(asUserA(), 'somethingElse', 'x'), { a: 1 }));
    await assertFails(setDoc(doc(asAdmin(), 'somethingElse', 'x'), { a: 1 }));
  });
});
