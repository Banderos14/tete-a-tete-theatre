// Создание брони — вся бизнес-логика целиком.
//
// Endpoint api/create-booking.ts только разбирает запрос и отдаёт ответ;
// всё, что описано ниже, происходит здесь и в ОДНОЙ транзакции Firestore:
//
//   идемпотентность → вместимость → лояльность → запись брони
//
// Транзакция обязательна: без неё два параллельных запроса могли бы
// перепродать зал или дважды списать один бонус.

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import { ApiError, conflict } from '../shared/errors.js';
import { normalizeIdempotencyKey } from '../shared/idempotency.js';
import { checkCapacity } from '../../shared/domain/bookingRules.js';
import {
  THEATRE_CAPACITY, showDateString, showStartUtcMs,
} from '../../shared/catalog/shows.js';
import type { CreateBookingResponse } from '../../shared/contracts/booking.js';
import {
  db, bookingsRef, readSoldTickets, readUserBookings,
  SHOW_COUNTERS, LOYALTY_STATE, IDEMPOTENCY_KEYS,
} from './booking.repository.js';
import { computeLoyalty } from './loyalty.js';
import { priceBasket, catalogTariffs, type TicketItem } from '../../shared/domain/ticketBasket.js';
import { ticketTypeLabel } from '../../shared/catalog/ticketTypes.js';
import { generateTicketCode } from './ticketCode.js';
import type { ValidatedBookingRequest } from './booking.validation.js';
import { isOnlinePaymentEnabled } from '../payments/stripe.client.js';
import { openCheckoutForBooking } from '../payments/checkout.service.js';
import { ONLINE_HOLD_BEFORE_SESSION_MS } from '../payments/onlinePayment.js';

// ── Константы оплаты ─────────────────────────────────────────────────────────

const PAYMENT_REF_PREFIX   = 'TETEATETE';
const PAYMENT_EXPIRY_HOURS = 24;
const PAYMENT_ACCOUNT_ID   = 'fr_eu_bank';

/** Данные зрителя из Firebase Auth. Их отсутствие бронь не блокирует. */
async function readUserIdentity(uid: string): Promise<{ userName: string; userEmail: string }> {
  try {
    const record = await getAuth(getAdminApp()).getUser(uid);
    return { userName: record.displayName ?? '', userEmail: record.email ?? '' };
  } catch {
    return { userName: '', userEmail: '' };
  }
}

export interface CreateBookingInput extends ValidatedBookingRequest {
  uid: string;
  /** Сырой ключ идемпотентности: из заголовка или тела запроса. */
  idempotencyKeyRaw: unknown;
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResponse> {
  const { uid, show, showId, lines, paymentMethod, phone, comment, lang } = input;

  // Спектакль не должен быть в прошлом. Даже если расписание забудут обновить,
  // сервер не продаёт билет в прошлое.
  const startMs = showStartUtcMs(show);
  if (startMs !== null && startMs <= Date.now()) {
    throw conflict('Show has already started', 'show_started');
  }

  // Онлайн-оплату разрешает только сервер: клиентский флаг лишь прячет кнопку.
  const isOnline = paymentMethod === 'online';
  if (isOnline && !isOnlinePaymentEnabled()) {
    throw new ApiError(503, 'Online payment is not available', 'online_payment_unavailable');
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKeyRaw);
  const { userName, userEmail } = await readUserIdentity(uid);

  const tariffs        = catalogTariffs(show.tickets);
  const nowMs          = Date.now();
  const isBankTransfer = paymentMethod === 'bank_transfer';
  const labelOf        = (type: string) => ticketTypeLabel(type, lang);
  const showDate       = showDateString(show);
  const database       = db();

  type TxResult =
    | { kind: 'created'; bookingId: string; ticketCode: string; totalAmount: number;
        baseAmount: number; discountAmount: number; priceInfo: string; ticketItems: TicketItem[];
        ticketsCount: number; seatsCount: number; loyaltyApplied: boolean; paymentReference: string | null; paymentExpiresAt: Timestamp | null }
    | { kind: 'replayed'; bookingId: string; ticketCode: string; totalAmount: number }
    | { kind: 'capacity'; remaining: number; soldOut: boolean };

  const result = await database.runTransaction<TxResult>(async (tx) => {
    // --- все чтения ДО записей (требование Firestore) ---

    // Идемпотентность: ключ привязан к пользователю, чтобы чужой нельзя было занять.
    const idemRef = idempotencyKey
      ? database.collection(IDEMPOTENCY_KEYS).doc(`booking_${uid}_${idempotencyKey}`)
      : null;

    if (idemRef) {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const prev = idemSnap.data() as { bookingId?: string; ticketCode?: string; totalAmount?: number };
        return {
          kind: 'replayed',
          bookingId:   String(prev.bookingId ?? ''),
          ticketCode:  String(prev.ticketCode ?? ''),
          totalAmount: Number(prev.totalAmount ?? 0),
        };
      }
    }

    const sold = await readSoldTickets(tx, showId);

    // ── Точки сериализации ────────────────────────────────────────────────
    // Транзакция Firestore блокирует ПРОЧИТАННЫЕ документы, но не диапазон
    // запроса: две параллельные транзакции могут не увидеть брони друг друга
    // (phantom read) и обе решить, что место есть, а бонус не потрачен.
    // Поэтому каждая бронь дополнительно читает И пишет два общих документа —
    // счётчик спектакля и состояние лояльности пользователя. Конфликт записи
    // в них заставляет Firestore перезапустить одну из транзакций, и на
    // повторе она уже видит зафиксированную бронь.
    const showCounterRef = database.collection(SHOW_COUNTERS).doc(showId);
    const loyaltyRef     = database.collection(LOYALTY_STATE).doc(uid);

    // Чтение обязательно: именно оно ставит блокировку на документ.
    await tx.get(showCounterRef);
    await tx.get(loyaltyRef);

    const userBookings = await readUserBookings(tx, uid);

    // Лояльность — только по реальным броням, прочитанным в этой транзакции
    // (shared/domain/loyalty.ts). Цена корзины — только из каталога
    // (shared/domain/ticketBasket.ts): скидка 50 % на ОДИН билет брони.
    const { loyaltyAvailable, attendedCount } = computeLoyalty(userBookings);
    const basket = priceBasket(tariffs, lines, loyaltyAvailable);
    const { seatsCount, ticketsCount, baseAmount, discountAmount, totalAmount } = basket;

    // Вместимость — по сумме мест всех тарифов корзины.
    const capacity = checkCapacity(sold, seatsCount, THEATRE_CAPACITY);
    if (!capacity.allowed) {
      return { kind: 'capacity', remaining: capacity.remaining, soldOut: capacity.soldOut };
    }

    const ticketCode = generateTicketCode();
    // Одна строка тарифа — прежний формат; несколько — через «; » и общая сумма.
    const composition = basket.items
      .map(i => `${labelOf(i.type)} · ${i.unitPrice}€ × ${i.quantity}`)
      .join('; ');
    const priceInfo = loyaltyAvailable
      ? `${composition} = ${baseAmount}€, скидка 50% на 1 билет = ${totalAmount}€`
      : `${composition} = ${totalAmount}€`;

    // Перевод — 24 часа. Онлайн — временный hold до создания сессии Stripe;
    // после создания его заменит фактический session.expires_at.
    // Оплата на месте срока не имеет.
    const paymentExpiresAt = isBankTransfer
      ? Timestamp.fromDate(new Date(nowMs + PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000))
      : isOnline ? Timestamp.fromMillis(nowMs + ONLINE_HOLD_BEFORE_SESSION_MS) : null;
    const paymentReference = isBankTransfer ? `${PAYMENT_REF_PREFIX}-${ticketCode}` : null;

    // Запись в счётчик — это ТОЧКА КОНФЛИКТА, а не источник правды:
    // авторитетное число мест всегда пересчитывается запросом по броням
    // (в том числе в /api/show-availability), потому что отмена бронь не
    // уменьшает этот счётчик. Значение хранится как диагностическое.
    tx.set(showCounterRef, {
      lastKnownSoldTickets: sold + seatsCount,
      updatedAt:            FieldValue.serverTimestamp(),
    }, { merge: true });

    // Документ лояльности — точка конфликта: две параллельные брони одного
    // пользователя (две вкладки) сериализуются, и вторая, перечитав брони,
    // уже видит скидку занятой первой. Использование скидки фиксирует сама
    // бронь (loyaltyDiscountApplied): отмена/протухание её возвращают.
    tx.set(loyaltyRef, {
      updatedAt: FieldValue.serverTimestamp(),
      ...(loyaltyAvailable ? { lastRewardAtMs: nowMs } : {}),
    }, { merge: true });

    const bookingRef = bookingsRef().doc();
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
      userPhone:    phone,
      ticketsCount,
      seatsCount,
      // Первый тариф корзины — для старого кода, читающего одно поле.
      ticketType:   basket.items[0]!.type,
      // Состав брони: цены — из каталога, записаны на момент брони.
      ticketItems:  basket.items,
      priceInfo,
      totalAmount,
      ticketCode,
      status:        'pending',
      paymentMethod,
      paymentStatus: isOnline ? 'awaiting_online' : isBankTransfer ? 'awaiting_transfer' : 'not_paid',
      comment,
      lang,
      createdAt:     FieldValue.serverTimestamp(),
      ...(isBankTransfer   ? { paymentAccountId: PAYMENT_ACCOUNT_ID } : {}),
      ...(paymentReference ? { paymentReference }                     : {}),
      ...(paymentExpiresAt ? { paymentExpiresAt }                     : {}),
      ...(loyaltyAvailable ? {
        originalAmount:                  baseAmount,
        loyaltyDiscountApplied:          true,
        loyaltyDiscountAmount:           discountAmount,
        loyaltyDiscountTicketType:       basket.discountTicketType,
        loyaltyRewardUsedFromVisitCount: attendedCount,
      } : {}),
    });

    if (idemRef) {
      // Пишется в той же транзакции, что и бронь: либо есть и бронь, и ключ,
      // либо нет ни того ни другого.
      tx.create(idemRef, {
        bookingId: bookingRef.id, ticketCode, totalAmount, userId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      kind: 'created',
      bookingId: bookingRef.id, ticketCode, totalAmount,
      baseAmount, discountAmount, priceInfo, ticketItems: basket.items, ticketsCount, seatsCount,
      loyaltyApplied: loyaltyAvailable, paymentReference, paymentExpiresAt,
    };
  });

  if (result.kind === 'capacity') {
    throw conflict(
      result.soldOut ? 'Sold out' : 'Not enough seats left',
      'capacity_exceeded',
      { remaining: result.remaining },
    );
  }

  const common = {
    showDate,
    showTime:    show.time,
    showTitle:   show.title,
    showTitleFR: show.titleFR,
  };

  // Онлайн-оплата: после коммита брони — сессия Stripe (вне транзакции).
  // Для повтора запроса вернётся та же сессия, а не новая.
  const checkout = isOnline ? await openCheckoutForBooking(result.bookingId) : null;
  const online   = checkout ? {
    checkoutState: checkout.checkoutState,
    ...(checkout.checkoutUrl      ? { checkoutUrl: checkout.checkoutUrl }           : {}),
    ...(checkout.paymentExpiresAt ? { paymentExpiresAt: checkout.paymentExpiresAt } : {}),
  } : {};

  if (result.kind === 'replayed') {
    // Повторный запрос с тем же ключом: бронь уже создана, дубликата нет.
    return {
      ok: true, replayed: true,
      bookingId:   result.bookingId,
      ticketCode:  result.ticketCode,
      totalAmount: result.totalAmount,
      ...common,
      ...online,
    };
  }

  return {
    ok: true,
    bookingId:   result.bookingId,
    ticketCode:  result.ticketCode,
    totalAmount: result.totalAmount,
    priceInfo:   result.priceInfo,
    ticketItems: result.ticketItems,
    ticketsCount: result.ticketsCount,
    seatsCount:  result.seatsCount,
    ...common,
    ...(result.paymentReference ? { paymentReference: result.paymentReference }            : {}),
    ...(result.paymentExpiresAt ? { paymentExpiresAt: result.paymentExpiresAt.toMillis() } : {}),
    ...(result.loyaltyApplied ? {
      originalAmount:         result.baseAmount,
      loyaltyDiscountApplied: true,
      loyaltyDiscountAmount:  result.discountAmount,
    } : {}),
    ...online,
  };
}
