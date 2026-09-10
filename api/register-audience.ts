// Vercel Serverless Function — учёт нового зрителя в публичном счётчике.
//
// Раньше счётчик увеличивал сам клиент:
//   • при регистрации по e-mail инкремент вызывался дважды — из signUpWithEmail
//     и из onAuthStateChanged, который не успевал увидеть только что созданный
//     профиль (гонка). Один пользователь давал +2;
//   • две одновременные первые регистрации перезаписывали счётчик стартовым
//     значением вместо инкремента;
//   • правила Firestore разрешали любому авторизованному слать +1 в цикле
//     и накручивать публичное число.
//
// Теперь счётчик меняет только сервер, ровно один раз на пользователя:
// отметка о том, что этот uid уже учтён, ставится в той же транзакции.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, bearerToken } from './_lib/http.js';

// Историческая база счётчика: зрители, пришедшие до появления сайта.
const AUDIENCE_BASELINE = 2451;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'POST')    { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  const idToken = bearerToken(req);
  if (!idToken) { respond(res, 401, { error: 'Authorization required' }, req); return; }

  const app = getAdminApp();
  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(idToken)).uid;
  } catch {
    respond(res, 401, { error: 'Invalid or expired token' }, req);
    return;
  }

  const db        = getFirestore(app);
  const statsRef  = db.collection('stats').doc('siteStats');
  const markerRef = db.collection('audienceCounted').doc(uid);

  try {
    const counted = await db.runTransaction(async (tx) => {
      const markerSnap = await tx.get(markerRef);
      const statsSnap  = await tx.get(statsRef);

      // Этот пользователь уже учтён — повторный вызов ничего не меняет.
      if (markerSnap.exists) return false;

      const current = statsSnap.exists && typeof statsSnap.data()?.audienceCount === 'number'
        ? Number(statsSnap.data()!.audienceCount)
        : AUDIENCE_BASELINE;

      tx.set(statsRef, { audienceCount: current + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(markerRef, { countedAt: FieldValue.serverTimestamp() });
      return true;
    });

    respond(res, 200, { ok: true, counted }, req);
  } catch (err) {
    console.error('[register-audience] transaction failed:', err);
    // Счётчик некритичен — не блокируем регистрацию.
    respond(res, 200, { ok: false, counted: false }, req);
  }
}
