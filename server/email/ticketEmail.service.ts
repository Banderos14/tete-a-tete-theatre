// Письма о брони и билете — отправляет ТОЛЬКО сервер.
//
// Раньше письма собирал и отправлял браузер после ответа API: зритель закрыл
// вкладку сразу после брони — бронь есть, письма нет. Теперь письмо уходит из
// того же серверного обработчика, где бронь создаётся или оплачивается.
//
// Правила:
//   • письмо НИКОГДА не откатывает бронь: здесь ничего не бросается наружу,
//     сбой Resend записывается в бронь (emails.<trigger>) и в emailLog;
//   • идемпотентность без очередей: перед отправкой «занимаем» письмо в брони
//     транзакцией. Повтор того же события (retry запроса, двойной клик) видит
//     sent/sending и второе письмо не шлёт. Явная повторная отправка
//     администратором (resend) идёт мимо этой защиты — она для того и нужна;
//   • QR строится здесь же из кода брони общей функцией ticketQrPayload —
//     тот же билет, что в кабинете и PDF. Не получилось построить или провайдер
//     отверг вложение — письмо уходит без картинки, с кодом и кнопкой кабинета.

import QRCode from 'qrcode';
import { db, BOOKINGS } from '../booking/booking.repository.js';
import { logEmailDelivery } from './email.repository.js';
import { routeEmail, type OutgoingEmail } from './recipient.js';
import { isProductionRuntime } from '../shared/runtimeEnv.js';
import type { TicketEmailType } from './email.types.js';
import { ticketQrPayload, CANONICAL_SITE_URL } from '../../shared/domain/ticketCode.js';
import { isScannableTicket } from '../../shared/domain/bookingRules.js';
import {
  buildTicketEmail, buildCancellationEmail, TICKET_QR_CID,
  type TicketEmailBooking, type TicketEmailKind,
} from '../../shared/email/ticketEmail.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** booking — после создания; paid — после подтверждения оплаты; resend — вручную; cancelled — отмена админом. */
export type EmailTrigger = TicketEmailKind | 'cancelled';

export interface EmailOutcome {
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

/** Запись о письме в брони: bookings/{id}.emails.<trigger>. */
export interface EmailRecord {
  status:          'sending' | 'sent' | 'failed' | 'skipped';
  atMs:            number;
  withQr?:         boolean;
  providerStatus?: number;
  reason?:         string;
}

// «sending», которое так и не завершилось (функцию убили посреди отправки),
// через это время перестаёт блокировать повтор.
const SENDING_STALE_MS = 5 * 60 * 1000;

const LOG_TYPE: Record<EmailTrigger, TicketEmailType> = {
  booking: 'ticket-booking', paid: 'ticket-paid', resend: 'ticket-resend', cancelled: 'booking-cancelled',
};

/** Публичный адрес сайта для QR и кнопки кабинета. PUBLIC_SITE_URL — необязательное переопределение. */
export function publicSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL ?? '').trim() || CANONICAL_SITE_URL;
}

function toTicketBooking(d: Record<string, unknown>): TicketEmailBooking {
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    userName:          str(d.userName),
    showId:            str(d.showId) || undefined,
    showTitle:         str(d.showTitle),
    showDate:          str(d.showDate),
    showTime:          str(d.showTime),
    ticketsCount:      num(d.ticketsCount, 1),
    seatsCount:        typeof d.seatsCount === 'number' ? d.seatsCount : undefined,
    ticketType:        str(d.ticketType),
    ticketItems:       Array.isArray(d.ticketItems) ? d.ticketItems : undefined,
    totalAmount:       num(d.totalAmount),
    originalAmount:    typeof d.originalAmount === 'number' ? d.originalAmount : undefined,
    loyaltyDiscountApplied: d.loyaltyDiscountApplied === true,
    loyaltyDiscountAmount:  typeof d.loyaltyDiscountAmount === 'number' ? d.loyaltyDiscountAmount : undefined,
    ticketCode:        str(d.ticketCode),
    status:            str(d.status),
    paymentMethod:     str(d.paymentMethod),
    paymentStatus:     str(d.paymentStatus),
    paymentAccountId:  str(d.paymentAccountId) || undefined,
    paymentReference:  str(d.paymentReference) || undefined,
    lang:              d.lang === 'FR' ? 'FR' : 'RU',
    refunded:          d.paymentStatus === 'refunded'
      || ['pending', 'succeeded'].includes(String((d.refund as { status?: unknown } | undefined)?.status ?? '')),
  };
}

/** Действующая бронь — ей положен билет с QR. Правило общее с кабинетом. */
function isLiveTicket(d: Record<string, unknown>): boolean {
  return isScannableTicket({
    status:        String(d.status ?? ''),
    paymentStatus: String(d.paymentStatus ?? ''),
    paymentMethod: String(d.paymentMethod ?? ''),
  });
}

async function writeRecord(bookingId: string, trigger: EmailTrigger, record: EmailRecord): Promise<void> {
  const ref = db().collection(BOOKINGS).doc(bookingId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const prev = ((snap.data() as Record<string, unknown>).emails ?? {}) as Record<string, unknown>;
    tx.update(ref, { emails: { ...prev, [trigger]: record } });
  });
}

type Claim =
  | { kind: 'go'; data: Record<string, unknown> }
  | { kind: 'skip'; reason: string };

/** Занимает письмо в брони. force — явная повторная отправка без проверки «уже отправлено». */
async function claim(bookingId: string, trigger: EmailTrigger, force: boolean, nowMs: number): Promise<Claim> {
  const ref = db().collection(BOOKINGS).doc(bookingId);
  return db().runTransaction<Claim>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { kind: 'skip', reason: 'not_found' };
    const data   = snap.data() as Record<string, unknown>;
    const emails = (data.emails ?? {}) as Record<string, EmailRecord | undefined>;
    const prev   = emails[trigger];
    if (!force && prev?.status === 'sent') return { kind: 'skip', reason: 'already_sent' };
    if (!force && prev?.status === 'sending' && nowMs - prev.atMs < SENDING_STALE_MS) {
      return { kind: 'skip', reason: 'in_progress' };
    }
    tx.update(ref, { emails: { ...emails, [trigger]: { status: 'sending', atMs: nowMs } } });
    return { kind: 'go', data };
  });
}

/**
 * Письмо через единую точку маршрутизации (server/email/recipient.ts): вне
 * production адресат подменяется тестовым. null — отправка запрещена.
 */
function routed(mail: OutgoingEmail, extra: Record<string, unknown> = {}): Record<string, unknown> | null {
  const route = routeEmail(mail);
  return route.kind === 'send' ? { ...route.email, ...extra } : null;
}

async function postToResend(payload: Record<string, unknown>, apiKey: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(RESEND_API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    console.error('[ticket-email] Resend error', res.status, details);
  }
  return { ok: res.ok, status: res.status };
}

/**
 * Отправляет письмо по брони. Никогда не бросает: результат — в возвращаемом
 * значении, в bookings/{id}.emails и в emailLog.
 */
export async function sendBookingEmail(
  bookingId: string,
  trigger: EmailTrigger,
  options: { force?: boolean } = {},
): Promise<EmailOutcome> {
  const nowMs = Date.now();
  let claimed: Claim;
  try {
    claimed = await claim(bookingId, trigger, options.force === true, nowMs);
  } catch (err) {
    console.error('[ticket-email] claim failed', bookingId, trigger, err);
    return { status: 'failed', reason: 'claim_failed' };
  }
  if (claimed.kind === 'skip') {
    // Повтор события (webhook retry, двойной клик) — второго письма нет. В лог —
    // чтобы в Vercel было видно, почему письмо не ушло именно этим вызовом.
    console.log(`[ticket-email] ${trigger} skipped (${claimed.reason})`, { bookingId });
    return { status: 'skipped', reason: claimed.reason };
  }

  const data = claimed.data;
  const uid  = String(data.userId ?? '');
  const finish = async (outcome: EmailOutcome, extra: Partial<EmailRecord> = {}): Promise<EmailOutcome> => {
    const record: EmailRecord = {
      status: outcome.status, atMs: Date.now(), ...extra, ...(outcome.reason ? { reason: outcome.reason } : {}),
    };
    // Каждый исход — в лог сервера, без адресов: причину «письмо не пришло»
    // видно в логах Vercel, а не только в bookings/{id}.emails.<trigger>.
    const log = outcome.status === 'failed' ? console.error : outcome.status === 'skipped' ? console.warn : console.log;
    log(`[ticket-email] ${trigger} ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ''}`, {
      bookingId,
      providerStatus: extra.providerStatus ?? null,
      redirectedToTestRecipient: !isProductionRuntime(),
    });
    await writeRecord(bookingId, trigger, record).catch(err => console.error('[ticket-email] record failed', err));
    await logEmailDelivery({
      type: LOG_TYPE[trigger], uid, status: outcome.status, bookingId,
      ...(extra.providerStatus ? { providerStatus: extra.providerStatus } : {}),
    });
    return outcome;
  };

  try {
    const to = String(data.userEmail ?? '').trim();
    if (!to) return await finish({ status: 'skipped', reason: 'no_recipient' });
    if (trigger !== 'cancelled' && !isLiveTicket(data)) return await finish({ status: 'skipped', reason: 'not_active' });

    const apiKey = process.env.RESEND_API_KEY;
    const from   = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.warn('[ticket-email] RESEND_API_KEY or EMAIL_FROM not set — email skipped');
      return await finish({ status: 'skipped', reason: 'not_configured' });
    }

    // Вне production без тестового адреса письмо не уходит никому (fail closed).
    if (routeEmail({ to, subject: '', html: '' }).kind === 'blocked') {
      return await finish({ status: 'skipped', reason: 'staging_no_test_recipient' });
    }

    const booking  = toTicketBooking(data);
    const siteBase = publicSiteUrl();

    if (trigger === 'cancelled') {
      const mail    = buildCancellationEmail(booking, siteBase);
      const payload = routed({ to, subject: mail.subject, html: mail.html, text: mail.text }, { from });
      if (!payload) return await finish({ status: 'skipped', reason: 'staging_no_test_recipient' });
      const res  = await postToResend(payload, apiKey);
      return await finish(res.ok ? { status: 'sent' } : { status: 'failed', reason: 'provider_error' },
        { providerStatus: res.status });
    }

    let qrPng: string | null = null;
    try {
      const png = await QRCode.toBuffer(ticketQrPayload(booking.ticketCode, siteBase), {
        type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M',
      });
      qrPng = png.toString('base64');
    } catch (err) {
      console.warn('[ticket-email] QR render failed, sending without image', err);
    }

    const send = (withQr: boolean) => {
      const mail    = buildTicketEmail(booking, { kind: trigger, withQr, siteBase });
      const payload = routed({ to, subject: mail.subject, html: mail.html, text: mail.text }, {
        from,
        ...(withQr && qrPng ? { attachments: [{
          filename: `ticket-${booking.ticketCode}.png`, content: qrPng,
          content_type: 'image/png', content_id: TICKET_QR_CID,
        }] } : {}),
      });
      // Маршрут проверен выше; повторная проверка — на случай смены окружения между вызовами.
      return payload ? postToResend(payload, apiKey) : Promise.resolve({ ok: false, status: 0 });
    };

    let withQr = qrPng !== null;
    let res = await send(withQr);
    // Письмо важнее картинки: провайдер отверг вложение (4xx, не лимит) —
    // отправляем то же письмо без QR: код брони и кнопка кабинета в нём есть.
    if (!res.ok && withQr && res.status >= 400 && res.status < 500 && res.status !== 429) {
      withQr = false;
      res = await send(false);
    }
    return await finish(res.ok ? { status: 'sent' } : { status: 'failed', reason: 'provider_error' },
      { providerStatus: res.status, withQr });
  } catch (err) {
    console.error('[ticket-email] send failed', bookingId, trigger, err);
    return finish({ status: 'failed', reason: 'exception' }).catch(() => ({ status: 'failed', reason: 'exception' }));
  }
}
