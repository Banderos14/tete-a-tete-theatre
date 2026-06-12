import { doc, getDoc, onSnapshot, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/config';

const statsRef = doc(db, 'stats', 'siteStats');

export function subscribeToAudienceCount(cb: (count: number) => void): () => void {
  return onSnapshot(
    statsRef,
    (snap) => {
      const data = snap.data();
      if (typeof data?.audienceCount === 'number') cb(data.audienceCount);
    },
    () => { /* silent — UI shows hardcoded fallback */ },
  );
}

/**
 * Called only on first registration of a new user.
 * - If stats doc doesn't exist or has no audienceCount: initialises to 2452 (2451 + this user).
 * - If doc exists with a number: atomically increments by 1.
 * Login and logout never call this.
 */
export async function ensureAudienceCounterAndIncrement(): Promise<void> {
  try {
    const snap = await getDoc(statsRef);
    const data = snap.data();
    if (!snap.exists() || typeof data?.audienceCount !== 'number') {
      await setDoc(statsRef, { audienceCount: 2452 }, { merge: true });
    } else {
      await setDoc(statsRef, { audienceCount: increment(1) }, { merge: true });
    }
  } catch {
    // best-effort: counter is non-critical
  }
}
