// Vercel Serverless Function — full user deletion via Firebase Admin SDK.
//
// Required env variable (Vercel Dashboard → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  — full service account JSON as a single-line string.
//                               Download from Firebase Console → Project Settings →
//                               Service Accounts → Generate new private key.
//   ALLOWED_ORIGIN            — (optional) production domain for CORS
//
// Security:
//   - Caller must supply a valid Firebase ID token in Authorization: Bearer <token>
//   - Caller's role is checked in Firestore — must be 'admin'
//   - Caller cannot delete their own account
//   - Admin SDK runs server-side only; no credentials exposed to the browser

import type { IncomingMessage, ServerResponse } from 'node:http';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sa: Record<string, any>;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON — check for unescaped quotes');
  }

  // Vercel stores env vars as single-line strings; private_key ends up with literal \n
  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  if (!sa.project_id)    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id');
  if (!sa.client_email)  throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email');
  if (!sa.private_key)   throw new Error('FIREBASE_SERVICE_ACCOUNT is missing private_key');

  try {
    return initializeApp({ credential: cert(sa) });
  } catch (e) {
    throw new Error(`Firebase Admin init failed: ${(e as Error).message}`, { cause: e });
  }
}

const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN,
  'https://www.theatre-teteatete.fr',
  'https://tete-a-tete-theatre.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
].filter(Boolean) as string[]);

function corsOrigin(req: IncomingMessage): string {
  const o = String(req.headers['origin'] ?? '');
  return ALLOWED_ORIGINS.has(o) ? o : 'https://www.theatre-teteatete.fr';
}

function send(res: ServerResponse, status: number, body: object, req?: IncomingMessage): void {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': req ? corsOrigin(req) : 'https://tete-a-tete-theatre.vercel.app',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: unknown) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { send(res, 204, {}, req); return; }
  if (req.method !== 'POST')   { send(res, 405, { error: 'Method not allowed' }, req); return; }

  // ── Auth header ─────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    send(res, 401, { error: 'Missing authorization token' }, req);
    return;
  }
  const idToken = authHeader.slice(7);

  // ── Body ─────────────────────────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    send(res, 400, { error: 'Invalid JSON' }, req);
    return;
  }

  const targetUid = parsed.uid as string | undefined;
  if (!targetUid || typeof targetUid !== 'string') {
    send(res, 400, { error: 'Missing uid' }, req);
    return;
  }

  try {
    const app  = getAdminApp();
    const auth = getAuth(app);
    const db   = getFirestore(app);

    // ── Verify caller token ──────────────────────────────────────────────────
    let callerUid: string;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      callerUid = decoded.uid;
    } catch {
      send(res, 401, { error: 'Invalid or expired token' }, req);
      return;
    }

    // ── Caller must be admin ─────────────────────────────────────────────────
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      send(res, 403, { error: 'Forbidden: admin only' }, req);
      return;
    }

    // ── Self-deletion guard ──────────────────────────────────────────────────
    if (callerUid === targetUid) {
      send(res, 400, { error: 'Cannot delete your own account' }, req);
      return;
    }

    // ── Target must exist and must not be admin ──────────────────────────────
    const targetSnap = await db.collection('users').doc(targetUid).get();
    if (!targetSnap.exists) {
      send(res, 404, { error: 'User not found' }, req);
      return;
    }
    if (targetSnap.data()?.role === 'admin') {
      send(res, 403, { error: 'Cannot delete an admin account' }, req);
      return;
    }

    // ── Delete bookings (batch) ──────────────────────────────────────────────
    const bookingsSnap = await db.collection('bookings').where('userId', '==', targetUid).get();
    const batch = db.batch();
    bookingsSnap.docs.forEach(d => batch.delete(d.ref));

    // ── Delete Firestore user document ───────────────────────────────────────
    batch.delete(db.collection('users').doc(targetUid));

    // ── Decrement audience counter ───────────────────────────────────────────
    // batch.update() throws NOT_FOUND (and aborts the whole batch) if the doc
    // doesn't exist yet — stats/siteStats is only lazily created on first
    // registration, so it may genuinely be missing. Never let that block deletion.
    const statsRef  = db.collection('stats').doc('siteStats');
    const statsSnap = await statsRef.get();
    if (statsSnap.exists) {
      batch.update(statsRef, { audienceCount: FieldValue.increment(-1) });
    }

    await batch.commit();
    const bookingsDeletedCount = bookingsSnap.size;

    // ── Delete Firebase Auth user ────────────────────────────────────────────
    let authDeleted = false;
    try {
      await auth.deleteUser(targetUid);
      authDeleted = true;
    } catch (e) {
      // auth/user-not-found is acceptable — may have already been removed
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      authDeleted = false;
    }

    console.log(
      `[delete-user] uid=${targetUid} | authDeleted=${authDeleted} | bookings=${bookingsDeletedCount}`,
    );

    send(res, 200, { ok: true, userDeleted: true, authDeleted, bookingsDeletedCount }, req);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code    = (err as { code?: string }).code;
    console.error('[delete-user]', err);
    send(res, 500, { ok: false, error: message, ...(code ? { code } : {}) }, req);
  }
}
