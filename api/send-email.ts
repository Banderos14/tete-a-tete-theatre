// Vercel Serverless Function — email sending via Resend.
//
// Runtime: Node.js (default Vercel runtime).
// This file is compiled by Vercel independently from the frontend bundle.
//
// Required env variables (set in Vercel Dashboard — never expose to frontend):
//   RESEND_API_KEY          — API key from resend.com (starts with "re_")
//   EMAIL_FROM              — verified sender, e.g. "Théâtre Tête-à-Tête <billets@yourdomain.fr>"
//                             The domain must be verified in your Resend account.
//   FIREBASE_SERVICE_ACCOUNT — full service account JSON (required for newsletter auth)
//
// Optional / CORS:
//   ALLOWED_ORIGIN          — production domain, e.g. https://www.theatre-teteatete.fr
//
// Optional frontend env variable (set in Vercel Dashboard + .env locally):
//   VITE_EMAIL_ENDPOINT=/api/send-email
//
// Security model:
//   - Client must send a 'type' field from a fixed enum; arbitrary types are rejected.
//   - 'newsletter' type additionally requires Authorization: Bearer <Firebase ID token>
//     which is verified server-side via Firebase Admin SDK (role must be 'admin').
//   - For all other types the server accepts the payload as-is (subject/html built by the
//     client-side template engine). The recipient 'to' is provided by the caller but only
//     delivered once RESEND_API_KEY is configured.
//   - CORS is restricted to explicit origins; no *.vercel.app wildcard.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth }      from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp }  from './_lib/firebaseAdmin.js';
import { consumeRateLimit } from './_lib/rateLimit.js';
import { respond, readBody, bearerToken } from './_lib/http.js';

// ── Constants ────────────────────────────────────────────────────────────────

const RESEND_API_URL  = 'https://api.resend.com/emails';
const MAX_SUBJECT_LEN = 500;
const MAX_HTML_LEN    = 120_000; // ~120 KB — well above any normal email

// ── Лимиты отправки ──────────────────────────────────────────────────────────
// Без них любой зарегистрированный пользователь мог в цикле слать себе письма
// и выжечь квоту Resend театра.
const HOUR_MS = 60 * 60 * 1000;
// Обычный зритель: подтверждений брони столько не бывает даже в самый активный день.
const USER_EMAIL_LIMIT_PER_HOUR  = 12;
// Администратор: рассылка идёт по одному письму на получателя, поэтому запас большой.
const ADMIN_EMAIL_LIMIT_PER_HOUR = 600;

// Whitelist of email types the client is allowed to request.
// Any payload without a recognised type is rejected with 400.
const ALLOWED_TYPES = new Set([
  'booking-confirmation',
  'booking-status',
  'payment-paid',
  'newsletter',       // admin-only — requires Bearer token (see below)
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
// CORS, чтение тела и ответы — общие для всех функций (api/_lib/http.ts):
// один и тот же набор заголовков, включая Access-Control-Allow-Headers,
// без которого preflight с Authorization не проходил.

function isValidEmail(s: string): boolean {
  // Minimal RFC-compliant check — enough for user input validation
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

// ── Firebase Admin — newsletter auth ─────────────────────────────────────────
// Reuses warm instance across invocations in the same Vercel function container.

// Returns true only if the Bearer token belongs to an admin user.
async function isAdminToken(idToken: string): Promise<boolean> {
  try {
    const app     = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const snap    = await getFirestore(app).collection('users').doc(decoded.uid).get();
    return snap.exists && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

// uid вызывающего или null, если токен недействителен.
async function resolveUid(idToken: string): Promise<string | null> {
  try {
    return (await getAuth(getAdminApp()).verifyIdToken(idToken)).uid;
  } catch {
    return null;
  }
}

// Письмо-подтверждение можно отправить только по СВОЕЙ реальной брони.
// Без этой проверки endpoint работал генератором произвольных писем от имени
// театра: любой авторизованный пользователь мог отправить себе что угодно.
async function ownsBookingWithTicketCode(uid: string, ticketCode: string): Promise<boolean> {
  try {
    const snap = await getFirestore(getAdminApp())
      .collection('bookings')
      .where('ticketCode', '==', ticketCode)
      .limit(1)
      .get();
    if (snap.empty) return false;
    return snap.docs[0]!.data()?.userId === uid;
  } catch {
    return false;
  }
}

// Returns true only if the Bearer token's email matches recipientEmail.
// Used to ensure booking-confirmation emails can only be sent to the
// authenticated caller's own address — prevents using the endpoint as
// an open relay to send arbitrary emails to third parties.
async function verifyRecipientIsCallerEmail(idToken: string, recipientEmail: string): Promise<boolean> {
  try {
    const app     = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const record  = await getAuth(app).getUser(decoded.uid);
    return typeof record.email === 'string' &&
      record.email.toLowerCase() === recipientEmail.toLowerCase();
  } catch {
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {

  // ── Method guard ────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    respond(res, 204, {}, req);
    return;
  }

  if (req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' }, req);
    return;
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  const { type, to, subject, html, text } = body;

  // ── Type whitelist ───────────────────────────────────────────────────────────
  if (!type || !ALLOWED_TYPES.has(String(type))) {
    respond(res, 400, { error: 'Missing or invalid type' }, req);
    return;
  }

  // ── Per-type auth checks ─────────────────────────────────────────────────────
  //
  //  booking-confirmation → caller must be authenticated; the recipient 'to' must
  //    match the authenticated user's own email (prevents open-relay phishing).
  //
  //  booking-status / payment-paid → sent by admin from the dashboard; caller
  //    must hold the admin role.
  //
  //  newsletter → admin-only (existing behaviour, unchanged).
  //
  const idToken = bearerToken(req);

  // Любой тип письма требует авторизации: анонимных отправок не бывает.
  if (!idToken) {
    respond(res, 401, { error: `${String(type)} requires Authorization: Bearer <token>` }, req);
    return;
  }

  const callerUid = await resolveUid(idToken);
  if (!callerUid) {
    respond(res, 401, { error: 'Invalid or expired token' }, req);
    return;
  }

  const isAdmin = await isAdminToken(idToken).catch(() => false);

  if (type === 'newsletter' || type === 'booking-status' || type === 'payment-paid') {
    if (!isAdmin) {
      respond(res, 403, { error: `${String(type)} is admin-only` }, req);
      return;
    }
  }

  // ── Лимит отправки ──────────────────────────────────────────────────────────
  // Считается по вызывающему, а не по получателю: цель — не дать выжечь квоту
  // Resend, кем бы получатель ни был.
  try {
    const limited = await consumeRateLimit(getFirestore(getAdminApp()), {
      bucket:   `${isAdmin ? 'email-admin' : 'email-user'}:${callerUid}`,
      limit:    isAdmin ? ADMIN_EMAIL_LIMIT_PER_HOUR : USER_EMAIL_LIMIT_PER_HOUR,
      windowMs: HOUR_MS,
    });
    if (!limited.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After':  String(Math.max(1, Math.ceil((limited.resetAtMs - Date.now()) / 1000))),
      });
      res.end(JSON.stringify({ error: 'Too many emails, try again later' }));
      return;
    }
  } catch (err) {
    // Сбой лимитера не должен ломать отправку подтверждения брони —
    // но и молча пропускать его нельзя, поэтому пишем в лог.
    console.error('[send-email] rate limit check failed:', err);
  }

  // ── Validate fields ──────────────────────────────────────────────────────────
  if (!isValidEmail(String(to ?? ''))) {
    respond(res, 400, { error: 'Missing or invalid recipient email' }, req);
    return;
  }

  if (
    typeof subject !== 'string' ||
    !subject.trim() ||
    subject.length > MAX_SUBJECT_LEN
  ) {
    respond(res, 400, { error: 'Missing or invalid subject' }, req);
    return;
  }

  if (
    typeof html !== 'string' ||
    !html.trim() ||
    html.length > MAX_HTML_LEN
  ) {
    respond(res, 400, { error: 'Missing or invalid html body' }, req);
    return;
  }

  // ── booking-confirmation: получатель == вызывающий И бронь принадлежит ему ───
  if (type === 'booking-confirmation') {
    const ok = await verifyRecipientIsCallerEmail(idToken, String(to)).catch(() => false);
    if (!ok) {
      respond(res, 403, { error: 'Recipient email must match the authenticated user' }, req);
      return;
    }

    // Письмо должно относиться к реальной брони вызывающего. Без этой привязки
    // endpoint оставался генератором произвольных писем от имени театра.
    const ticketCode = typeof body.ticketCode === 'string' ? body.ticketCode.trim() : '';
    if (!ticketCode) {
      respond(res, 400, { error: 'ticketCode is required for booking-confirmation' }, req);
      return;
    }
    const owns = await ownsBookingWithTicketCode(callerUid, ticketCode);
    if (!owns) {
      respond(res, 403, { error: 'Booking not found for this user' }, req);
      return;
    }
  }

  // ── Check env ────────────────────────────────────────────────────────────────
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM;

  if (!apiKey || !fromAddr) {
    // Env not configured — return 200 so the booking is never blocked.
    // The booking is already saved in Firestore at this point.
    console.warn('[send-email] RESEND_API_KEY or EMAIL_FROM not set — email skipped');
    respond(res, 200, { ok: true, skipped: true, reason: 'Email provider not configured' }, req);
    return;
  }

  // ── Send via Resend ──────────────────────────────────────────────────────────
  console.log('[EMAIL] FROM =', fromAddr, '| type =', String(type));
  const resendBody: Record<string, string> = {
    from:    fromAddr,
    to:      String(to),
    subject: subject.trim(),
    html,
  };
  if (typeof text === 'string' && text.trim()) {
    resendBody['text'] = text.trim();
  }

  try {
    const resendRes = await fetch(RESEND_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendBody),
    });

    if (resendRes.ok) {
      respond(res, 200, { ok: true }, req);
      return;
    }

    // Resend returned an error — log details server-side, send safe message client-side
    const errData = await resendRes.json().catch(() => ({})) as Record<string, unknown>;
    console.error('[send-email] Resend responded with error', resendRes.status, errData);
    respond(res, 500, { error: 'Email provider error' }, req);

  } catch (err) {
    console.error('[send-email] Network error calling Resend:', err);
    respond(res, 500, { error: 'Internal server error' }, req);
  }
}
