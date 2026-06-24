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
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth }      from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ── Constants ────────────────────────────────────────────────────────────────

const RESEND_API_URL  = 'https://api.resend.com/emails';
const MAX_SUBJECT_LEN = 500;
const MAX_HTML_LEN    = 120_000; // ~120 KB — well above any normal email

// Whitelist of email types the client is allowed to request.
// Any payload without a recognised type is rejected with 400.
const ALLOWED_TYPES = new Set([
  'booking-confirmation',
  'booking-status',
  'payment-paid',
  'newsletter',       // admin-only — requires Bearer token (see below)
]);

// ── CORS ─────────────────────────────────────────────────────────────────────

// Restrict CORS to explicitly known origins only.
// VITE_PUBLIC_SITE_URL is a frontend build var and is NOT available here at runtime;
// use ALLOWED_ORIGIN (plain server-side env var) in Vercel Dashboard instead.
const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN,           // Vercel env — set to https://www.theatre-teteatete.fr
  'https://www.theatre-teteatete.fr',   // production domain (explicit fallback)
  'https://tete-a-tete-theatre.vercel.app', // legacy Vercel domain
  'http://localhost:5173',              // Vite dev server
  'http://localhost:4173',              // Vite preview
  'http://localhost:3000',              // alternative dev port
].filter(Boolean) as string[]);

function getCorsOrigin(req: IncomingMessage): string {
  const origin = String(req.headers['origin'] ?? '');
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.theatre-teteatete.fr';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(res: ServerResponse, status: number, body: object, req?: IncomingMessage): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': req ? getCorsOrigin(req) : 'https://www.theatre-teteatete.fr',
  });
  res.end(payload);
}

function isValidEmail(s: string): boolean {
  // Minimal RFC-compliant check — enough for user input validation
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── Firebase Admin — newsletter auth ─────────────────────────────────────────
// Reuses warm instance across invocations in the same Vercel function container.

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sa: Record<string, any>;
  try { sa = JSON.parse(raw); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }

  // Vercel stores env vars as single-line strings; private_key ends up with literal \n
  if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');

  if (!sa.project_id)   throw new Error('FIREBASE_SERVICE_ACCOUNT missing project_id');
  if (!sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT missing client_email');
  if (!sa.private_key)  throw new Error('FIREBASE_SERVICE_ACCOUNT missing private_key');

  return initializeApp({ credential: cert(sa) });
}

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
  const rawAuth = String(req.headers['authorization'] ?? '');
  const idToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : null;

  if (type === 'newsletter' || type === 'booking-status' || type === 'payment-paid') {
    if (!idToken) {
      respond(res, 401, { error: `${String(type)} requires Authorization: Bearer <token>` }, req);
      return;
    }
    const adminOk = await isAdminToken(idToken).catch(() => false);
    if (!adminOk) {
      respond(res, 403, { error: `${String(type)} is admin-only` }, req);
      return;
    }
  }

  if (type === 'booking-confirmation') {
    if (!idToken) {
      respond(res, 401, { error: 'booking-confirmation requires Authorization: Bearer <token>' }, req);
      return;
    }
    // Recipient verification is deferred until after `to` is extracted and validated below.
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

  // ── booking-confirmation: verify recipient == authenticated user ──────────────
  // idToken is guaranteed non-null here (checked in the auth block above).
  if (type === 'booking-confirmation') {
    const ok = await verifyRecipientIsCallerEmail(idToken!, String(to)).catch(() => false);
    if (!ok) {
      respond(res, 403, { error: 'Recipient email must match the authenticated user' }, req);
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
