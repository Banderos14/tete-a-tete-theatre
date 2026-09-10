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
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, readBody, bearerToken } from './_lib/http.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')   { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  // ── Auth header ─────────────────────────────────────────────────────────────
  const idToken = bearerToken(req);
  if (!idToken) {
    respond(res, 401, { error: 'Missing authorization token' }, req);
    return;
  }

  // ── Body ─────────────────────────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    respond(res, 400, { error: 'Invalid JSON' }, req);
    return;
  }

  const targetUid = parsed.uid as string | undefined;
  if (!targetUid || typeof targetUid !== 'string') {
    respond(res, 400, { error: 'Missing uid' }, req);
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
      respond(res, 401, { error: 'Invalid or expired token' }, req);
      return;
    }

    // ── Caller must be admin ─────────────────────────────────────────────────
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      respond(res, 403, { error: 'Forbidden: admin only' }, req);
      return;
    }

    // ── Self-deletion guard ──────────────────────────────────────────────────
    if (callerUid === targetUid) {
      respond(res, 400, { error: 'Cannot delete your own account' }, req);
      return;
    }

    // ── Target must exist and must not be admin ──────────────────────────────
    const targetSnap = await db.collection('users').doc(targetUid).get();
    if (!targetSnap.exists) {
      respond(res, 404, { error: 'User not found' }, req);
      return;
    }
    if (targetSnap.data()?.role === 'admin') {
      respond(res, 403, { error: 'Cannot delete an admin account' }, req);
      return;
    }

    // ── Удаление броней порциями ─────────────────────────────────────────────
    // В одном batch Firestore допускает не больше 500 операций. Раньше все брони
    // складывались в один batch вместе с документом пользователя и счётчиком:
    // у зрителя с большой историей удаление просто падало.
    const bookingsSnap = await db.collection('bookings').where('userId', '==', targetUid).get();
    const bookingsDeletedCount = bookingsSnap.size;

    const BATCH_LIMIT = 450; // запас до лимита 500 на прочие операции порции
    for (let i = 0; i < bookingsSnap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const doc of bookingsSnap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(doc.ref);
      await batch.commit();
    }

    // ── Профиль, отметка счётчика и сам счётчик ──────────────────────────────
    const finalBatch = db.batch();
    finalBatch.delete(db.collection('users').doc(targetUid));

    // Отметка «этот зритель уже учтён» удаляется вместе с пользователем:
    // если человек зарегистрируется заново, он снова будет посчитан.
    const markerRef  = db.collection('audienceCounted').doc(targetUid);
    const markerSnap = await markerRef.get();
    if (markerSnap.exists) finalBatch.delete(markerRef);

    // batch.update() бросает NOT_FOUND и рушит всю порцию, если документа нет:
    // stats/siteStats создаётся лениво, поэтому его может не существовать.
    const statsRef  = db.collection('stats').doc('siteStats');
    const statsSnap = await statsRef.get();
    if (statsSnap.exists && markerSnap.exists) {
      finalBatch.update(statsRef, { audienceCount: FieldValue.increment(-1) });
    }

    await finalBatch.commit();

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

    respond(res, 200, { ok: true, userDeleted: true, authDeleted, bookingsDeletedCount }, req);

  } catch (err) {
    // Наружу — нейтральный текст. Раньше клиенту уходил внутренний err.message
    // с деталями инфраструктуры; подробности должны оставаться в серверном логе.
    console.error('[delete-user]', err);
    respond(res, 500, { ok: false, error: 'Failed to delete user' }, req);
  }
}
