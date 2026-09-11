// Публичный счётчик зрителей.
//
// Счётчик меняет только сервер и ровно один раз на пользователя: отметка о том,
// что этот uid уже учтён, ставится в той же транзакции. Раньше инкремент делал
// клиент, и регистрация по e-mail давала +2 из-за гонки двух вызовов.

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';

// Историческая база счётчика: зрители, пришедшие до появления сайта.
const AUDIENCE_BASELINE = 2451;

export const STATS_DOC = 'siteStats';
export const AUDIENCE_COUNTED = 'audienceCounted';

/** true, если этот зритель учтён именно сейчас; false — если уже был учтён. */
export async function registerAudienceMember(uid: string): Promise<boolean> {
  const db        = getFirestore(getAdminApp());
  const statsRef  = db.collection('stats').doc(STATS_DOC);
  const markerRef = db.collection(AUDIENCE_COUNTED).doc(uid);

  return db.runTransaction(async (tx) => {
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
}
