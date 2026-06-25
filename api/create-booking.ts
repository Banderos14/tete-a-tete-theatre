// Vercel Serverless Function — server-side booking creation.
//
// Security model:
//   - Requires Authorization: Bearer <Firebase ID token>
//   - Client sends ONLY: showId, ticketType, ticketsCount, paymentMethod, comment, phone, lang
//   - totalAmount, status, paymentStatus, ticketCode are computed here — never read from client
//   - Loyalty discount is computed from the user's Firestore booking history
//   - Booking is written via Admin SDK (bypasses Firestore security rules)
//
// Required env variables (same as send-email):
//   FIREBASE_SERVICE_ACCOUNT — full service account JSON
//
// Optional:
//   ALLOWED_ORIGIN — e.g. https://www.theatre-teteatete.fr
//
// IMPORTANT: When show dates/prices change, update the SHOWS map below
// AND src/data/shows.ts in the frontend.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set(
  [
    process.env.ALLOWED_ORIGIN,
    'https://www.theatre-teteatete.fr',
    'https://tete-a-tete-theatre.vercel.app',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
  ].filter(Boolean) as string[],
);

function getCorsOrigin(req: IncomingMessage): string {
  const origin = String(req.headers['origin'] ?? '');
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.theatre-teteatete.fr';
}

// ── Server-side show & ticket pricing ────────────────────────────────────────
// Canonical source of truth — client cannot override these values.

type TicketTypeId = 'standard' | 'student';

interface TicketInfo {
  label:   string;
  labelFR: string;
  price:   number;
}

interface ShowInfo {
  title:   string;
  titleFR: string;
  day:     string;
  month:   string;
  time:    string;
  year:    string;
  tickets: Partial<Record<TicketTypeId, TicketInfo>>;
}

const SHOWS: Record<string, ShowInfo> = {
  romantika: {
    title: '«Романтика обреченности»', titleFR: '«La Romanesque de la Fatalité»',
    day: '14', month: 'Июн', time: '19:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
    },
  },
  shutka: {
    title: '«И в шутку, и всерьёз»', titleFR: '«Sérieusement ou pas»',
    day: '28', month: 'Июн', time: '20:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 15 },
      student:  { label: 'Студенческий', labelFR: 'Étudiant', price: 10 },
    },
  },
  nulin: {
    title: '«Граф Нулин»', titleFR: '«Le Comte Nouline»',
    day: '12', month: 'Июл', time: '20:00', year: '2026',
    tickets: {
      standard: { label: 'Стандарт', labelFR: 'Standard', price: 30 },
      student:  { label: 'Студенческий', labelFR: 'Étudiant', price: 20 },
    },
  },
};

// ── Payment constants ─────────────────────────────────────────────────────────

const PAYMENT_REF_PREFIX   = 'TETEATETE';
const PAYMENT_EXPIRY_HOURS = 24;
const PAYMENT_ACCOUNT_ID   = 'fr_eu_bank';

// ── Ticket code (Node.js crypto — same charset as frontend ticketService.ts) ──

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateTicketCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CHARSET[bytes[i]! % CHARSET.length];
  }
  return code;
}

// ── Loyalty (mirrors loyaltyService.ts + attendanceService.ts) ───────────────

const MONTH_RU: Record<string, number> = {
  'Янв': 0, 'Фев': 1, 'Мар': 2, 'Апр': 3,
  'Май': 4, 'Июн': 5, 'Июл': 6, 'Авг': 7,
  'Сен': 8, 'Окт': 9, 'Ноя': 10, 'Дек': 11,
};

function parseShowEnd(showDate: string, showTime: string): Date | null {
  const parts = showDate.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const month = MONTH_RU[monthStr!];
  if (month === undefined) return null;
  const [hStr, mStr] = showTime.split(':');
  const day  = parseInt(dayStr!,    10);
  const year = parseInt(yearStr!,   10);
  const hour = parseInt(hStr!,      10);
  const min  = parseInt(mStr ?? '0', 10);
  if (isNaN(day) || isNaN(year) || isNaN(hour)) return null;
  return new Date(year, month, day, hour + 2, min, 0);
}

interface RawBooking {
  status?:                 string;
  paymentStatus?:          string;
  showDate?:               string;
  showTime?:               string;
  loyaltyDiscountApplied?: boolean;
}

function computedIsAttended(b: RawBooking): boolean {
  if (b.status === 'attended') return true;
  if (b.status !== 'confirmed' || b.paymentStatus !== 'paid') return false;
  const end = parseShowEnd(b.showDate ?? '', b.showTime ?? '');
  return !!end && end < new Date();
}

function computeLoyalty(bookings: RawBooking[]): { loyaltyAvailable: boolean; attendedCount: number } {
  const attended  = bookings.filter(computedIsAttended).length;
  const usedCount = bookings.filter(b => b.loyaltyDiscountApplied === true).length;
  return {
    loyaltyAvailable: attended >= 5 && Math.floor(attended / 5) > usedCount,
    attendedCount:    attended,
  };
}

// ── Firebase Admin ─────────────────────────────────────────────────────────────

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sa: Record<string, any>;
  try { sa = JSON.parse(raw); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
  if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return initializeApp({ credential: cert(sa) });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function respond(res: ServerResponse, status: number, body: object, req?: IncomingMessage): void {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': req ? getCorsOrigin(req) : 'https://www.theatre-teteatete.fr',
  });
  res.end(JSON.stringify(body));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {

  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON body' }, req);
    return;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const rawAuth = String(req.headers['authorization'] ?? '');
  const idToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : null;
  if (!idToken) {
    respond(res, 401, { error: 'Authorization: Bearer <token> required' }, req);
    return;
  }

  const app = getAdminApp();
  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    respond(res, 401, { error: 'Invalid or expired token' }, req);
    return;
  }

  // ── Validate input (ignore any price/status/ticketCode from client) ─────────
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
    ticketsCount > 10
  ) {
    respond(res, 400, { error: 'ticketsCount must be integer 1–10' }, req);
    return;
  }
  if (paymentMethod !== 'on_site' && paymentMethod !== 'bank_transfer') {
    respond(res, 400, { error: 'paymentMethod must be on_site or bank_transfer' }, req);
    return;
  }
  if (typeof phone !== 'string' || phone.trim().length < 5) {
    respond(res, 400, { error: 'phone is required' }, req);
    return;
  }

  const show       = SHOWS[showId as string]!;
  const ticketInfo = show.tickets[ticketType as TicketTypeId];
  if (!ticketInfo) {
    respond(res, 400, {
      error: `ticketType '${String(ticketType)}' not available for '${String(showId)}'`,
    }, req);
    return;
  }

  // ── Compute totals server-side ──────────────────────────────────────────────
  const db = getFirestore(app);

  let userBookings: RawBooking[] = [];
  try {
    const snap = await db.collection('bookings').where('userId', '==', uid).get();
    userBookings = snap.docs.map(d => d.data() as RawBooking);
  } catch {
    // Loyalty check fails gracefully — proceed without discount
  }

  const { loyaltyAvailable, attendedCount } = computeLoyalty(userBookings);
  const baseAmount     = ticketInfo.price * ticketsCount;
  const discountAmount = loyaltyAvailable ? Math.floor(baseAmount / 2) : 0;
  const totalAmount    = baseAmount - discountAmount;

  // ── Build booking document ──────────────────────────────────────────────────
  const ticketCode     = generateTicketCode();
  const isBankTransfer = paymentMethod === 'bank_transfer';
  const resolvedLang   = lang === 'FR' ? 'FR' : 'RU';
  const ticketLabel    = resolvedLang === 'FR' ? ticketInfo.labelFR : ticketInfo.label;
  const showDate       = `${show.day} ${show.month} ${show.year}`;

  const priceInfo = loyaltyAvailable
    ? `${ticketLabel} · ${ticketInfo.price}€ × ${ticketsCount} = ${baseAmount}€, скидка 50% = ${totalAmount}€`
    : `${ticketLabel} · ${ticketInfo.price}€ × ${ticketsCount} = ${totalAmount}€`;

  const paymentExpiresAt = isBankTransfer
    ? Timestamp.fromDate(new Date(Date.now() + PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000))
    : null;
  const paymentReference = isBankTransfer ? `${PAYMENT_REF_PREFIX}-${ticketCode}` : null;

  let userName  = '';
  let userEmail = '';
  try {
    const record = await getAuth(app).getUser(uid);
    userName  = record.displayName ?? '';
    userEmail = record.email       ?? '';
  } catch {
    // Proceed with empty strings — booking is still written
  }

  const bookingDoc: Record<string, unknown> = {
    showId,
    showTitle:    show.title,
    showDate,
    showTime:     show.time,
    userId:       uid,
    userName,
    userEmail,
    userPhone:    String(phone).trim(),
    ticketsCount,
    ticketType,
    priceInfo,
    totalAmount,
    ticketCode,
    status:        'pending',
    paymentMethod,
    paymentStatus: isBankTransfer ? 'awaiting_transfer' : 'not_paid',
    comment:       typeof comment === 'string' ? comment.trim() : '',
    lang:          resolvedLang,
    createdAt:     FieldValue.serverTimestamp(),
    ...(isBankTransfer  ? { paymentAccountId: PAYMENT_ACCOUNT_ID } : {}),
    ...(paymentReference ? { paymentReference }                     : {}),
    ...(paymentExpiresAt ? { paymentExpiresAt }                     : {}),
    ...(loyaltyAvailable ? {
      originalAmount:                  baseAmount,
      loyaltyDiscountApplied:          true,
      loyaltyDiscountAmount:           discountAmount,
      loyaltyRewardUsedFromVisitCount: attendedCount,
    } : {}),
  };

  // ── Write via Admin SDK (bypasses Firestore security rules) ─────────────────
  let bookingId: string;
  try {
    const ref = await db.collection('bookings').add(bookingDoc);
    bookingId = ref.id;
  } catch (err) {
    console.error('[create-booking] Firestore write failed:', err);
    respond(res, 500, { error: 'Failed to create booking' }, req);
    return;
  }

  respond(res, 200, {
    ok:            true,
    bookingId,
    ticketCode,
    totalAmount,
    priceInfo,
    showDate,
    showTime:      show.time,
    showTitle:     show.title,
    showTitleFR:   show.titleFR,
    ...(paymentReference  ? { paymentReference }                            : {}),
    ...(paymentExpiresAt  ? { paymentExpiresAt: paymentExpiresAt.toMillis() } : {}),
    ...(loyaltyAvailable  ? {
      originalAmount:          baseAmount,
      loyaltyDiscountApplied:  true,
      loyaltyDiscountAmount:   discountAmount,
    } : {}),
  }, req);
}
