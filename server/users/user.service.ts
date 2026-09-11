// Полное удаление пользователя.
//
// Каскад: брони → профиль → отметка в счётчике зрителей → аккаунт Firebase Auth.
// Брони удаляются порциями: в одном batch Firestore допускает не больше
// 500 операций, и у зрителя с большой историей удаление просто падало.

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import { badRequest, notFound, forbidden } from '../shared/errors.js';
import { AUDIENCE_COUNTED, STATS_DOC } from '../audience/audience.service.js';

const BATCH_LIMIT = 450; // запас до лимита 500 на прочие операции порции

export interface DeleteUserResult {
  ok:                   true;
  userDeleted:          boolean;
  authDeleted:          boolean;
  bookingsDeletedCount: number;
}

export async function deleteUserCompletely(callerUid: string, targetUid: unknown): Promise<DeleteUserResult> {
  if (typeof targetUid !== 'string' || !targetUid) throw badRequest('Missing uid');

  const app  = getAdminApp();
  const auth = getAuth(app);
  const db   = getFirestore(app);

  if (callerUid === targetUid) throw badRequest('Cannot delete your own account');

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) throw notFound('User not found');
  if (targetSnap.data()?.role === 'admin') throw forbidden('Cannot delete an admin account');

  // ── Удаление броней порциями ─────────────────────────────────────────────
  const bookingsSnap = await db.collection('bookings').where('userId', '==', targetUid).get();
  const bookingsDeletedCount = bookingsSnap.size;

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
  const markerRef  = db.collection(AUDIENCE_COUNTED).doc(targetUid);
  const markerSnap = await markerRef.get();
  if (markerSnap.exists) finalBatch.delete(markerRef);

  // batch.update() бросает NOT_FOUND и рушит всю порцию, если документа нет:
  // stats/siteStats создаётся лениво, поэтому его может не существовать.
  const statsRef  = db.collection('stats').doc(STATS_DOC);
  const statsSnap = await statsRef.get();
  if (statsSnap.exists && markerSnap.exists) {
    finalBatch.update(statsRef, { audienceCount: FieldValue.increment(-1) });
  }

  await finalBatch.commit();

  // ── Аккаунт Firebase Auth ────────────────────────────────────────────────
  let authDeleted = false;
  try {
    await auth.deleteUser(targetUid);
    authDeleted = true;
  } catch (e) {
    // auth/user-not-found допустим — аккаунт мог быть удалён раньше.
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }

  console.log(`[delete-user] uid=${targetUid} | authDeleted=${authDeleted} | bookings=${bookingsDeletedCount}`);
  return { ok: true, userDeleted: true, authDeleted, bookingsDeletedCount };
}
