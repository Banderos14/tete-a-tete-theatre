// Групповой проход: один QR — все активные брони зрителя на этот сеанс.
//
// Модель броней не меняется: каждая бронь остаётся отдельным документом со
// своим кодом и QR. Здесь только серверная агрегация и атомарное действие.
//
// Клиент присылает ТОЛЬКО код отсканированного билета. Состав группы, суммы и
// статусы оплаты сервер каждый раз определяет заново внутри транзакции —
// то, что сканер показал несколько секунд назад, могло устареть.

import type { Transaction } from 'firebase-admin/firestore';
import { conflict, notFound, badRequest } from '../shared/errors.js';
import type { CheckinBooking, CheckinGroup, CheckinRefusalReason } from '../../shared/contracts/checkin.js';
import { db, findByTicketCode, readUserBookingDocs } from '../booking/booking.repository.js';
import {
  TICKET_CODE_RE, snapshotOf, paidTransition, attendedTransition,
} from './checkin.service.js';
import {
  groupKeyOf, isActiveBooking, selectGroupMembers, summarizeGroup, isAttended, isCashDue,
} from './group.js';

function normalizeCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!TICKET_CODE_RE.test(code)) throw badRequest('Invalid ticket code format', 'bad_code');
  return code;
}

/** Отсканированная бронь и её группа, прочитанные в транзакции. */
async function readGroup(tx: Transaction, ticketCode: string, nowMs: number) {
  const found = await findByTicketCode(tx, ticketCode);
  if (!found) return null;

  const root = snapshotOf(found.id, ticketCode, found.data, nowMs);
  const key  = groupKeyOf(found.data);
  // Отменённая или протухшая бронь группу не открывает: по её QR брони
  // аккаунта даже не запрашиваются.
  if (!key || !isActiveBooking(found.data)) return { found, root, members: null };

  const docs    = await readUserBookingDocs(tx, key.userId);
  const members = selectGroupMembers(found, docs);
  return { found, root, members };
}

function snapshotsOf(members: Array<{ id: string; data: Record<string, unknown> }>, nowMs: number): CheckinBooking[] {
  return members.map(m => snapshotOf(m.id, String(m.data.ticketCode ?? ''), m.data, nowMs));
}

/**
 * Группа для экрана сканера. Только чтение: транзакция readOnly, записей нет.
 *
 * Возвращает null, когда показывать группу не нужно — одиночная бронь,
 * отменённая/протухшая, без userId или на прошедший сеанс. Тогда сканер
 * остаётся в прежнем одиночном режиме. Сбой поиска группы не ломает проверку
 * билета: ошибка пишется в лог, а сотрудник видит обычную карточку.
 */
export async function inspectGroup(rawTicketCode: unknown): Promise<CheckinGroup | null> {
  try {
    const ticketCode = normalizeCode(rawTicketCode);
    return await db().runTransaction(async (tx) => {
      const nowMs = Date.now();
      const read  = await readGroup(tx, ticketCode, nowMs);
      if (!read?.members || read.members.length < 2) return null;
      if (read.root.showRelevance === 'too_late') return null;
      return summarizeGroup(read.found.id, snapshotsOf(read.members, nowMs), read.root.showRelevance);
    }, { readOnly: true });
  } catch (err) {
    console.error('[checkin-ticket] group lookup failed:', err);
    return null;
  }
}

export interface GroupCheckinInput {
  adminUid:   string;
  ticketCode: unknown;
}

export interface GroupCheckinResult {
  ok:      true;
  changed: true;
  booking: CheckinBooking;
  group:   CheckinGroup;
  /** Брони, которые ЭТОТ запрос перевёл not_paid → paid: письмо об оплате только по ним. */
  paidBookings: CheckinBooking[];
}

type GroupOutcome =
  | { kind: 'missing' }
  | { kind: 'refused'; refusal: CheckinRefusalReason; message: string; booking: CheckinBooking; group?: CheckinGroup }
  | { kind: 'done'; booking: CheckinBooking; group: CheckinGroup; paidBookings: CheckinBooking[] };

export async function groupCheckin(input: GroupCheckinInput): Promise<GroupCheckinResult> {
  const ticketCode = normalizeCode(input.ticketCode);

  const outcome = await db().runTransaction<GroupOutcome>(async (tx) => {
    const nowMs = Date.now();
    const read  = await readGroup(tx, ticketCode, nowMs);
    if (!read) return { kind: 'missing' };

    const { root } = read;
    const refuse = (refusal: CheckinRefusalReason, message: string, group?: CheckinGroup): GroupOutcome =>
      ({ kind: 'refused', refusal, message, booking: root, ...(group ? { group } : {}) });

    // Отсканированная бронь проверяется первой: QR отменённой или протухшей
    // брони не должен открывать проход по остальным броням аккаунта.
    if (root.status === 'cancelled')        return refuse('cancelled', 'Booking cancelled');
    if (root.paymentStatus === 'expired')   return refuse('expired', 'Booking expired');
    if (root.showRelevance === 'too_late')  return refuse('show_over', 'Show already ended');
    if (!read.members)                      return refuse('no_group', 'Booking cannot be grouped');

    const members  = read.members;
    const before   = snapshotsOf(members, nowMs);
    const summary  = summarizeGroup(read.found.id, before, root.showRelevance);

    if (summary.remainingBookings === 0) {
      return refuse('already_attended', 'All tickets already used', summary);
    }
    if (summary.blockedBookingIds.length > 0) {
      return refuse('payment_pending', 'Group has a booking with unconfirmed payment', summary);
    }
    if (!summary.canCheckIn) return refuse('no_group', 'Group check-in is not available', summary);

    const after: CheckinBooking[] = [];
    const paidBookings: CheckinBooking[] = [];

    members.forEach((member, i) => {
      const b = before[i]!;
      if (isAttended(b)) { after.push(b); return; }

      const attendedFields = attendedTransition(input.adminUid);

      if (isCashDue(b)) {
        // Оплата и проход одной записью: те же поля, что у mark_paid и
        // mark_attended подряд, итоговый статус — attended.
        const paidFields = paidTransition(input.adminUid);
        tx.update(member.ref, { ...paidFields, ...attendedFields });
        const paid = { ...b, paymentStatus: paidFields.paymentStatus, status: paidFields.status };
        paidBookings.push(paid);
        after.push({ ...paid, status: attendedFields.status });
        return;
      }

      tx.update(member.ref, attendedFields);
      after.push({ ...b, status: attendedFields.status });
    });

    const group   = summarizeGroup(read.found.id, after, root.showRelevance);
    const booking = after.find(b => b.bookingId === read.found.id) ?? root;
    return { kind: 'done', booking, group, paidBookings };
  });

  if (outcome.kind === 'missing') throw notFound('Ticket not found', 'not_found');
  if (outcome.kind === 'refused') {
    throw conflict(outcome.message, outcome.refusal, {
      booking: outcome.booking,
      ...(outcome.group ? { group: outcome.group } : {}),
    });
  }

  return { ok: true, changed: true, booking: outcome.booking, group: outcome.group, paidBookings: outcome.paidBookings };
}
