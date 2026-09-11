import { describe, it, expect } from 'vitest';
import { endpointSource, projectSource, transactionBody } from '../helpers/serverSource.js';

// Удаление отменённой брони — HARD DELETE, поэтому правило «только cancelled»
// обязано жить на сервере: UI лишь не показывает кнопку там, где её быть
// не должно, и полагаться на него нельзя.

const api     = endpointSource('api/delete-booking.ts');
const handler = projectSource('api/delete-booking.ts');
const service = projectSource('server/booking/deletion.service.ts');

const bookingsTab   = projectSource('src/pages/AdminPage/BookingsTab.tsx');
const dialogs       = projectSource('src/pages/AdminPage/AdminConfirmDialogs.tsx');
const adminData     = projectSource('src/pages/AdminPage/useAdminData.ts');
const bookingClient = projectSource('src/services/bookingService.ts');

describe('/api/delete-booking: авторизация', () => {
  it('требует аутентификации и роли admin', () => {
    expect(handler).toContain('requireAdmin');
    // requireAdmin сначала проверяет токен, затем роль из Firestore.
    const auth = projectSource('server/shared/auth.ts');
    expect(auth).toMatch(/export async function requireAdmin[\s\S]{0,300}requireCaller\(req\)/);
    expect(auth).toMatch(/isAdminUid\(caller\.uid\)[\s\S]{0,60}throw forbidden/);
  });

  it('роль читается из Firestore, а не из тела запроса', () => {
    expect(api).toMatch(/collection\('users'\)[\s\S]{0,80}role === 'admin'/);
    expect(handler).not.toContain('body.role');
    expect(handler).not.toContain('isAdmin');
  });

  it('отвечает только на POST', () => {
    expect(handler).toMatch(/req\.method !== 'POST'[\s\S]{0,80}405/);
  });

  it('ошибки идут через общий ApiError/errorResponse', () => {
    expect(handler).toContain('errorResponse');
    expect(service).toMatch(/from '\.\.\/shared\/errors\.js'/);
  });
});

describe('/api/delete-booking: правило удаления', () => {
  it('удаляет только бронь со статусом cancelled', () => {
    const tx = transactionBody(api);
    expect(tx).toMatch(/status !== 'cancelled'/);
    expect(service).toContain("'not_cancelled'");
  });

  it('статус перечитывается внутри транзакции, а не берётся из запроса', () => {
    const tx = transactionBody(api);
    // Между открытием админки и нажатием корзины бронь могли вернуть в работу.
    expect(tx).toMatch(/tx\.get\(ref\)/);
    expect(tx).toMatch(/snap\.data\(\)[\s\S]{0,40}status/);
    expect(service).not.toMatch(/status\s*=\s*\w+\.status/);
  });

  it('несуществующая бронь даёт 404, неотменённая — 409', () => {
    expect(service).toMatch(/kind === 'missing'[\s\S]{0,80}notFound/);
    expect(service).toMatch(/kind === 'not_cancelled'[\s\S]{0,200}conflict/);
  });

  it('bookingId проверяется перед подстановкой в путь документа', () => {
    // Строка со слэшем адресовала бы другой документ.
    expect(service).toMatch(/SAFE_DOC_ID_RE\s*=\s*\/\^\[A-Za-z0-9_-\]/);
    expect(service).toMatch(/SAFE_DOC_ID_RE\.test\(value\)[\s\S]{0,60}badRequest/);
  });

  it('удаление и очистка ключей идемпотентности атомарны', () => {
    const tx = transactionBody(api);
    expect(tx).toContain('tx.delete(ref)');
    expect(tx).toMatch(/tx\.delete\(key\.ref\)/);
  });
});

describe('/api/delete-booking: связанные данные', () => {
  it('висячий ключ идемпотентности удаляется вместе с бронью', () => {
    // Ключ хранит bookingId: без очистки повторный запрос с тем же
    // Idempotency-Key вернул бы ссылку на несуществующую бронь.
    expect(service).toContain('IDEMPOTENCY_KEYS');
    expect(service).toMatch(/where\('bookingId', '==', bookingId\)/);
  });

  it('счётчик израсходованных бонусов не обнуляется', () => {
    // loyaltyState/{uid} — отдельный persistent-счётчик, и computeLoyalty берёт
    // max(история, счётчик). Удаление брони со скидкой не должно возвращать
    // пользователю уже потраченный бонус.
    expect(service).not.toContain('LOYALTY_STATE');
    expect(projectSource('server/booking/loyalty.ts')).toContain('Math.max(usedFromHist, usedFromState)');
  });

  it('чужие данные не удаляются заодно', () => {
    for (const collection of ['users', 'audienceCounted', 'emailLog', 'showCounters', 'stats']) {
      expect(service, collection).not.toContain(`'${collection}'`);
    }
  });

  it('удаление не отправляет писем', () => {
    // Письмо об отмене ушло при самой отмене; повторять его или слать новое
    // «ваша бронь удалена» не нужно — это административная уборка.
    // Проверяем вызовы, а не слово: в комментариях сервиса email упоминается
    // именно затем, чтобы объяснить, почему письма здесь нет.
    expect(api).not.toMatch(/from '[^']*email[^']*'/i);
    expect(api).not.toMatch(/\bsend[A-Za-z]*Email\s*\(/);
    expect(api).not.toContain('api.resend.com');
    expect(service).not.toMatch(/from '[^']*email[^']*'/i);
  });
});

describe('админка: корзина только у отменённой брони', () => {
  it('кнопка удаления показывается в ветке cancelled', () => {
    expect(bookingsTab).toMatch(/bStatus === 'cancelled' \? \([\s\S]{0,400}actionDelete/);
  });

  it('у активной брони вместо корзины остаётся «Отменить»', () => {
    const actionsCell = bookingsTab.slice(bookingsTab.indexOf('className={styles.actions}'));
    expect(actionsCell).toContain('actionCancel');
    expect(actionsCell).toMatch(/type: 'cancel'/);
  });

  it('иконка из библиотеки проекта, с подписью для скринридера', () => {
    expect(bookingsTab).toContain("from '@tabler/icons-react'");
    expect(bookingsTab).toContain('IconTrash');
    expect(bookingsTab).toContain('aria-label="Удалить бронь"');
    expect(bookingsTab).toContain('title="Удалить бронь"');
  });

  it('корзина красная — тот же акцент, что у «Отменить»', () => {
    const scss = projectSource('src/pages/AdminPage/AdminPage.module.scss');
    const rule = scss.slice(scss.indexOf('.actionDelete'), scss.indexOf('.payBadge'));
    expect(rule).toContain('rgba(184, 0, 0');
    expect(rule).toContain('var(--accent-glow)');
  });

  it('в разметке нет эмодзи вместо иконки', () => {
    expect(bookingsTab).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('админка: подтверждение удаления', () => {
  it('нажатие корзины открывает диалог, а не удаляет сразу', () => {
    expect(bookingsTab).toMatch(/onConfirmAction\(\{ type: 'deleteBooking'/);
    expect(bookingsTab).not.toContain('deleteBooking(');
  });

  it('используется общий ConfirmDialog с требуемыми текстами', () => {
    expect(dialogs).toContain('title="Удалить бронь?"');
    expect(dialogs).toContain('Вы уверены, что хотите безвозвратно удалить эту бронь? Это действие нельзя отменить.');
    expect(dialogs).toContain('confirmLabel="Да, удалить"');
    expect(dialogs).toContain('cancelLabel="Отмена"');
  });

  it('отказ просто закрывает диалог', () => {
    const block = dialogs.slice(
      dialogs.indexOf("isOpen={action?.type === 'deleteBooking'}"),
      dialogs.indexOf("isOpen={action?.type === 'deleteUser'}"),
    );
    expect(block).toContain('onCancel={onClose}');
    // Удаление вызывается только из onConfirm.
    expect(block).toMatch(/onConfirm=\{[\s\S]{0,200}onDeleteBooking\(action\.bookingId\)/);
  });

  it('диалог показывает loading во время запроса', () => {
    const block = dialogs.slice(dialogs.indexOf("isOpen={action?.type === 'deleteBooking'}"));
    expect(block).toMatch(/loading=\{action\?\.type === 'deleteBooking' && updatingId === action\.bookingId\}/);
  });
});

describe('админка: состояние после удаления', () => {
  it('повторный клик во время запроса игнорируется', () => {
    expect(adminData).toMatch(/async function deleteBooking[\s\S]{0,120}if \(updatingId === bookingId\) return;/);
  });

  it('бронь исчезает из списка только после успеха сервера', () => {
    const fn = adminData.slice(adminData.indexOf('async function deleteBooking'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    // setBookings стоит ПОСЛЕ await: при ошибке запись остаётся на месте.
    expect(body).toMatch(/await deleteCancelledBooking\(bookingId\);\s*\n\s*setBookings\(prev => prev\.filter/);
  });

  it('ошибка показывается и не оставляет оптимистичных изменений', () => {
    const fn = adminData.slice(adminData.indexOf('async function deleteBooking'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body).toContain('setDeleteBookingError');
    const catchBlock = body.slice(body.indexOf('} catch'));
    expect(catchBlock).not.toContain('setBookings');
  });

  it('счётчики пересчитываются из того же списка броней', () => {
    // Сводка и статистика по спектаклям считаются из bookings на каждом рендере,
    // поэтому отдельной синхронизации после удаления не нужно.
    expect(bookingsTab).toContain('countTickets(bookings)');
    expect(bookingsTab).toContain('paidRevenue(bookings)');
    expect(bookingsTab).toContain('const totalBookings = bookings.length;');
  });
});

describe('клиент не пишет в Firestore напрямую', () => {
  it('удаление идёт через серверный endpoint с токеном', () => {
    const fn = bookingClient.slice(bookingClient.indexOf('export async function deleteCancelledBooking'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain("'/api/delete-booking'");
    expect(body).toContain('Authorization');
    expect(body).toContain('getIdToken');
    expect(body).not.toContain('deleteDoc');
  });

  it('правила Firestore по-прежнему не дают клиенту удалять брони', () => {
    const rules = projectSource('firestore.rules');
    const bookings = rules.slice(rules.indexOf('match /bookings/{bookingId}'), rules.indexOf('match /stats/'));
    // Удаление разрешено только админу — и то админка ходит через endpoint.
    expect(bookings).toMatch(/allow read, update, delete: if isAdmin\(\)/);
    expect(bookings).toContain('allow create: if false');
  });
});
