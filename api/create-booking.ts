// Vercel Serverless Function — серверное создание брони.
//
// Модель безопасности:
//   - требуется Authorization: Bearer <Firebase ID token>
//   - клиент присылает ТОЛЬКО: showId, ticketType, ticketsCount, paymentMethod,
//     comment, phone, lang
//   - totalAmount, status, paymentStatus, ticketCode считаются здесь и никогда
//     не читаются из запроса
//   - скидка лояльности вычисляется из истории броней пользователя
//   - вместимость зала проверяется в транзакции: параллельные запросы не могут
//     продать больше мест, чем есть
//   - бронь пишется через Admin SDK (в обход правил Firestore)
//
// Обязательные переменные окружения:
//   FIREBASE_SERVICE_ACCOUNT
// Опционально:
//   ALLOWED_ORIGIN

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, readBody, bearerToken } from './_lib/http.js';
import { normalizeIdempotencyKey } from './_lib/idempotency.js';
import { MAX_COMMENT_LEN, MAX_PHONE_LEN, MIN_PHONE_LEN } from './_lib/limits.js';
import { sumOccupiedTickets, checkCapacity, isBookingAttended } from './_lib/bookingRules.js';
import { parseShowStartUtcMs } from './_lib/showTime.js';
import {
  SHOWS, THEATRE_CAPACITY, MAX_TICKETS_PER_BOOKING,
  showDateString, showStartUtcMs,
  type TicketTypeId,
} from './_lib/shows.js';

// ── Константы оплаты ─────────────────────────────────────────────────────────

const PAYMENT_REF_PREFIX   = 'TETEATETE';
const PAYMENT_EXPIRY_HOURS = 24;
const PAYMENT_ACCOUNT_ID   = 'fr_eu_bank';


// ── Код билета ───────────────────────────────────────────────────────────────
// Алфавит без визуально похожих символов (0/O, 1/I/L): код диктуют голосом
// и переписывают от руки. randomInt даёт равномерное распределение без
// modulo bias, в отличие от прежнего randomBytes()[i] % 31.

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}

// ── Лояльность ───────────────────────────────────────────────────────────────
// Зеркалит src/services/loyaltyService.ts: 1 посещение = 1 бронь,
// каждые 5 посещений — одна скидка 50 %.

interface RawBooking {
  showStartAtMs?:          number;
  status?:                 string;
  paymentStatus?:          string;
  showDate?:               string;
  showTime?:               string;
  ticketsCount?:           number;
  loyaltyDiscountApplied?: boolean;
}

function computedIsAttended(b: RawBooking, nowMs: number): boolean {
  // Время начала: у новых броней хранится полем showStartAt, у старых
  // восстанавливается из строк как настенное время Europe/Paris.
  const start = typeof b.showStartAtMs === 'number'
    ? b.showStartAtMs
    : parseShowStartUtcMs(b.showDate ?? '', b.showTime ?? '');
  return isBookingAttended(
    { status: String(b.status ?? ''), paymentStatus: String(b.paymentStatus ?? '') },
    start,
    nowMs,
  );
}

function computeLoyalty(
  bookings: RawBooking[], nowMs: number, usedFromState = 0,
): { loyaltyAvailable: boolean; attendedCount: number; usedCount: number } {
  const attended     = bookings.filter(b => computedIsAttended(b, nowMs)).length;
  const usedFromHist = bookings.filter(b => b.loyaltyDiscountApplied === true).length;
  const usedCount    = Math.max(usedFromHist, usedFromState);
  return {
    loyaltyAvailable: attended >= 5 && Math.floor(attended / 5) > usedCount,
    attendedCount:    attended,
    usedCount,
  };
}

// ── Вместимость ──────────────────────────────────────────────────────────────
// Считается ВНУТРИ транзакции по актуальным броням, поэтому отдельного счётчика
// (который мог бы разъехаться с реальностью) не существует. Отменённые и
// протухшие брони места не занимают.

async function readSoldTickets(
  tx: Transaction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bookingsRef: any,
  showId: string,
): Promise<number> {
  const snap = await tx.get(bookingsRef.where('showId', '==', showId));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sumOccupiedTickets(snap.docs.map((d: any) => {
    const data = d.data() as RawBooking;
    return {
      status:        String(data.status ?? ''),
      paymentStatus: String(data.paymentStatus ?? ''),
      ticketsCount:  data.ticketsCount,
    };
  }));
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {

  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  const idToken = bearerToken(req);
  if (!idToken) {
    respond(res, 401, { error: 'Authorization: Bearer <token> required' }, req);
    return;
  }

  // Ключ идемпотентности: повторная отправка той же формы (двойной клик, двойной
  // Enter, ретрай из-за обрыва сети) не должна создавать вторую бронь.
  // Осознанная новая покупка отправляется с новым ключом и проходит штатно.
  const idempotencyKey = normalizeIdempotencyKey(
    req.headers['idempotency-key'] ?? (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null),
  );

  const app = getAdminApp();
  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(idToken)).uid;
  } catch {
    respond(res, 401, { error: 'Invalid or expired token' }, req);
    return;
  }

  // ── Валидация входа (цена/статус/ticketCode из клиента игнорируются) ────────
  const { showId, ticketType, ticketsCount, paymentMethod, comment, phone, lang } = body;

  if (typeof showId !== 'string' || !(showId in SHOWS)) {
    respond(res, 400, { error: 'Invalid showId' }, req);
    return;
  }
  if (ticketType !== 'standard' && ticketType !== 'student') {
    respond(res, 400, { error: 'ticketType must be standard or student' }, req);
    return;
  }
  if (
    typeof ticketsCount !== 'number' ||
    !Number.isInteger(ticketsCount) ||
    ticketsCount < 1 ||
    ticketsCount > MAX_TICKETS_PER_BOOKING
  ) {
    respond(res, 400, { error: `ticketsCount must be integer 1–${MAX_TICKETS_PER_BOOKING}` }, req);
    return;
  }
  if (paymentMethod !== 'on_site' && paymentMethod !== 'bank_transfer') {
    respond(res, 400, { error: 'paymentMethod must be on_site or bank_transfer' }, req);
    return;
  }
  const phoneValue = typeof phone === 'string' ? phone.trim() : '';
  if (phoneValue.length < MIN_PHONE_LEN || phoneValue.length > MAX_PHONE_LEN) {
    respond(res, 400, { error: 'phone is required' }, req);
    return;
  }
  if (typeof comment === 'string' && comment.length > MAX_COMMENT_LEN) {
    respond(res, 400, { error: `comment must be at most ${MAX_COMMENT_LEN} characters` }, req);
    return;
  }

  const show       = SHOWS[showId]!;
  const ticketInfo = show.tickets[ticketType as TicketTypeId];
  if (!ticketInfo) {
    respond(res, 400, {
      error: `ticketType '${String(ticketType)}' not available for '${String(showId)}'`,
    }, req);
    return;
  }

  // ── Спектакль не должен быть в прошлом ──────────────────────────────────────
  // Даже если расписание в данных забудут обновить, сервер не продаёт билет в прошлое.
  const startMs = showStartUtcMs(show);
  if (startMs !== null && startMs <= Date.now()) {
    respond(res, 409, { error: 'Show has already started', reason: 'show_started' }, req);
    return;
  }

  const db = getFirestore(app);

  // ── Данные пользователя из Firebase Auth ────────────────────────────────────
  let userName  = '';
  let userEmail = '';
  try {
    const record = await getAuth(app).getUser(uid);
    userName  = record.displayName ?? '';
    userEmail = record.email       ?? '';
  } catch {
    // Продолжаем с пустыми строками — бронь всё равно создаётся
  }

  const nowMs          = Date.now();
  const isBankTransfer = paymentMethod === 'bank_transfer';
  const resolvedLang   = lang === 'FR' ? 'FR' : 'RU';
  const ticketLabel    = resolvedLang === 'FR' ? ticketInfo.labelFR : ticketInfo.label;
  const showDate       = showDateString(show);
  const bookingsRef    = db.collection('bookings');

  // ── Транзакция: вместимость + лояльность + запись брони ─────────────────────
  type TxOk = {
    ok: true; replayed?: boolean; bookingId: string; ticketCode: string; totalAmount: number;
    baseAmount: number; discountAmount: number; priceInfo: string;
    loyaltyAvailable: boolean; paymentReference: string | null; paymentExpiresAt: Timestamp | null;
  };
  type TxFail = { ok: false; code: number; error: string; reason?: string; remaining?: number };

  let result: TxOk | TxFail;
  try {
    result = await db.runTransaction<TxOk | TxFail>(async (tx) => {
      // --- все чтения ДО записей (требование Firestore) ---

      // Идемпотентность: ключ принадлежит пользователю, чтобы чужой ключ
      // нельзя было «занять».
      const idemRef = idempotencyKey
        ? db.collection('idempotencyKeys').doc(`booking_${uid}_${idempotencyKey}`)
        : null;

      if (idemRef) {
        const idemSnap = await tx.get(idemRef);
        if (idemSnap.exists) {
          const prev = idemSnap.data() as { bookingId?: string; ticketCode?: string; totalAmount?: number };
          // Повтор той же операции — отдаём тот же результат, новую бронь не создаём.
          return {
            ok: true, replayed: true,
            bookingId:   String(prev.bookingId ?? ''),
            ticketCode:  String(prev.ticketCode ?? ''),
            totalAmount: Number(prev.totalAmount ?? 0),
            baseAmount: 0, discountAmount: 0, priceInfo: '',
            loyaltyAvailable: false, paymentReference: null, paymentExpiresAt: null,
          };
        }
      }

      const sold = await readSoldTickets(tx, bookingsRef, showId);

      // ── Точки сериализации ───────────────────────────────────────────────
      // Транзакция Firestore блокирует ПРОЧИТАННЫЕ документы, но не диапазон
      // запроса: две параллельные транзакции могут не увидеть брони друг друга
      // (phantom read) и обе решить, что место есть, а бонус не потрачен.
      // Поэтому каждая бронь дополнительно читает И пишет два общих документа —
      // счётчик спектакля и состояние лояльности пользователя. Конфликт записи
      // в них заставляет Firestore перезапустить одну из транзакций, и на
      // повторе она уже видит зафиксированную бронь.
      const showCounterRef = db.collection('showCounters').doc(showId);
      const loyaltyRef     = db.collection('loyaltyState').doc(uid);

      // Чтение обязательно: именно оно ставит блокировку на документ.
      await tx.get(showCounterRef);
      const loyaltySnap     = await tx.get(loyaltyRef);

      const userSnap = await tx.get(bookingsRef.where('userId', '==', uid));
      const userBookings = userSnap.docs.map(d => {
        const data = d.data() as RawBooking & { showStartAt?: { toMillis?: () => number } };
        return {
          ...data,
          showStartAtMs: typeof data.showStartAt?.toMillis === 'function'
            ? data.showStartAt.toMillis()
            : undefined,
        } as RawBooking;
      });

      const capacity = checkCapacity(sold, ticketsCount, THEATRE_CAPACITY);
      if (!capacity.allowed) {
        return {
          ok: false, code: 409,
          error: capacity.soldOut ? 'Sold out' : 'Not enough seats left',
          reason: 'capacity_exceeded',
          remaining: capacity.remaining,
        };
      }

      // Сколько бонусов уже израсходовано. Берём максимум из двух источников:
      // счётчика (обновляется атомарно) и фактической истории броней — так
      // расхождение всегда трактуется в пользу театра, а не двойной скидки.
      const usedFromState = typeof (loyaltySnap.data()?.rewardsUsed) === 'number'
        ? Number(loyaltySnap.data()!.rewardsUsed)
        : 0;

      const { loyaltyAvailable, attendedCount } = computeLoyalty(userBookings, nowMs, usedFromState);
      const baseAmount     = ticketInfo.price * ticketsCount;
      const discountAmount = loyaltyAvailable ? Math.floor(baseAmount / 2) : 0;
      const totalAmount    = baseAmount - discountAmount;

      const ticketCode = generateTicketCode();
      const priceInfo  = loyaltyAvailable
        ? `${ticketLabel} · ${ticketInfo.price}€ × ${ticketsCount} = ${baseAmount}€, скидка 50% = ${totalAmount}€`
        : `${ticketLabel} · ${ticketInfo.price}€ × ${ticketsCount} = ${totalAmount}€`;

      const paymentExpiresAt = isBankTransfer
        ? Timestamp.fromDate(new Date(nowMs + PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000))
        : null;
      const paymentReference = isBankTransfer ? `${PAYMENT_REF_PREFIX}-${ticketCode}` : null;

      // Запись в счётчик — это ТОЧКА КОНФЛИКТА, а не источник правды:
      // авторитетное число мест всегда пересчитывается запросом по броням
      // (в том числе в /api/show-availability), потому что отмена бронь не
      // уменьшает этот счётчик. Значение хранится как диагностическое.
      tx.set(showCounterRef, {
        lastKnownSoldTickets: sold + ticketsCount,
        updatedAt:            FieldValue.serverTimestamp(),
      }, { merge: true });

      if (loyaltyAvailable) {
        // Бонус списывается в той же транзакции, что и создаётся бронь.
        tx.set(loyaltyRef, {
          rewardsUsed: (typeof loyaltySnap.data()?.rewardsUsed === 'number'
            ? Number(loyaltySnap.data()!.rewardsUsed) : 0) + 1,
          updatedAt:   FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        // Даже без скидки касаемся документа: он должен быть точкой конфликта
        // для параллельных броней одного пользователя.
        tx.set(loyaltyRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      const bookingRef = bookingsRef.doc();
      tx.create(bookingRef, {
        showId,
        showTitle:    show.title,
        showDate,
        showTime:     show.time,
        // Абсолютный момент начала — чтобы бизнес-логика не зависела от разбора
        // строки «14 Июн 2026» в чьей-то локальной таймзоне.
        showStartAt:  Timestamp.fromMillis(startMs ?? nowMs),
        userId:       uid,
        userName,
        userEmail,
        userPhone:    phoneValue,
        ticketsCount,
        ticketType,
        priceInfo,
        totalAmount,
        ticketCode,
        status:        'pending',
        paymentMethod,
        paymentStatus: isBankTransfer ? 'awaiting_transfer' : 'not_paid',
        comment:       typeof comment === 'string' ? comment.trim().slice(0, MAX_COMMENT_LEN) : '',
        lang:          resolvedLang,
        createdAt:     FieldValue.serverTimestamp(),
        ...(isBankTransfer   ? { paymentAccountId: PAYMENT_ACCOUNT_ID } : {}),
        ...(paymentReference ? { paymentReference }                     : {}),
        ...(paymentExpiresAt ? { paymentExpiresAt }                     : {}),
        ...(loyaltyAvailable ? {
          originalAmount:                  baseAmount,
          loyaltyDiscountApplied:          true,
          loyaltyDiscountAmount:           discountAmount,
          loyaltyRewardUsedFromVisitCount: attendedCount,
        } : {}),
      });

      if (idemRef) {
        // Пишется в той же транзакции, что и бронь: либо есть и бронь, и ключ,
        // либо нет ни того ни другого.
        tx.create(idemRef, {
          bookingId:   bookingRef.id,
          ticketCode,
          totalAmount,
          userId:      uid,
          createdAt:   FieldValue.serverTimestamp(),
        });
      }

      return {
        ok: true, bookingId: bookingRef.id, ticketCode, totalAmount,
        baseAmount, discountAmount, priceInfo, loyaltyAvailable,
        paymentReference, paymentExpiresAt,
      };
    });
  } catch (err) {
    console.error('[create-booking] transaction failed:', err);
    respond(res, 500, { error: 'Failed to create booking' }, req);
    return;
  }

  if (!result.ok) {
    respond(res, result.code, {
      error: result.error,
      ...(result.reason    !== undefined ? { reason: result.reason }       : {}),
      ...(result.remaining !== undefined ? { remaining: result.remaining } : {}),
    }, req);
    return;
  }

  if (result.replayed) {
    // Повторный запрос с тем же ключом: бронь уже создана, дубликата нет.
    respond(res, 200, {
      ok:          true,
      replayed:    true,
      bookingId:   result.bookingId,
      ticketCode:  result.ticketCode,
      totalAmount: result.totalAmount,
      showDate,
      showTime:    show.time,
      showTitle:   show.title,
      showTitleFR: show.titleFR,
    }, req);
    return;
  }

  respond(res, 200, {
    ok:            true,
    bookingId:     result.bookingId,
    ticketCode:    result.ticketCode,
    totalAmount:   result.totalAmount,
    priceInfo:     result.priceInfo,
    showDate,
    showTime:      show.time,
    showTitle:     show.title,
    showTitleFR:   show.titleFR,
    ...(result.paymentReference ? { paymentReference: result.paymentReference }            : {}),
    ...(result.paymentExpiresAt ? { paymentExpiresAt: result.paymentExpiresAt.toMillis() } : {}),
    ...(result.loyaltyAvailable ? {
      originalAmount:          result.baseAmount,
      loyaltyDiscountApplied:  true,
      loyaltyDiscountAmount:   result.discountAmount,
    } : {}),
  }, req);
}
