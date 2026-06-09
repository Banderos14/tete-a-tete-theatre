// Vercel Serverless Function — email sending via Resend.
//
// Runtime: Node.js (default Vercel runtime).
// This file is compiled by Vercel independently from the frontend bundle.
//
// Required env variables (set in Vercel Dashboard — never expose to frontend):
//   RESEND_API_KEY   — API key from resend.com (starts with "re_")
//   EMAIL_FROM       — verified sender, e.g. "Théâtre Tête-à-Tête <billets@yourdomain.fr>"
//                      The domain must be verified in your Resend account.
//
// Optional frontend env variable (set in Vercel Dashboard + .env locally):
//   VITE_EMAIL_ENDPOINT=/api/send-email

import type { IncomingMessage, ServerResponse } from 'node:http';

const RESEND_API_URL  = 'https://api.resend.com/emails';
const MAX_SUBJECT_LEN = 500;
const MAX_HTML_LEN    = 120_000; // ~120 KB — well above any normal email

// ── helpers ───────────────────────────────────────────────────────────────────

// Restrict CORS to the known Vercel deployments + custom domain.
// VITE_PUBLIC_SITE_URL is a frontend build var and is NOT available here at runtime;
// use ALLOWED_ORIGIN (plain server-side env var) in Vercel Dashboard instead.
const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN,
  'https://tete-a-tete-theatre.vercel.app',
].filter(Boolean) as string[]);

function getCorsOrigin(req: IncomingMessage): string {
  const origin = req.headers['origin'] ?? '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  // Allow all *.vercel.app preview URLs
  if (typeof origin === 'string' && origin.endsWith('.vercel.app')) return origin;
  return 'https://tete-a-tete-theatre.vercel.app';
}

function respond(res: ServerResponse, status: number, body: object, req?: IncomingMessage): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': req ? getCorsOrigin(req) : 'https://tete-a-tete-theatre.vercel.app',
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

// ── handler ───────────────────────────────────────────────────────────────────

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

  const { to, subject, html, text } = body;

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
  console.log('[EMAIL] FROM =', fromAddr);
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
