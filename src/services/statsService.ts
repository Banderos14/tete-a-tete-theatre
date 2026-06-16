// Firebase is loaded lazily after first paint — keeps it out of the critical JS path.
// The module-level statsRef is intentionally removed: doc() is called inside each function
// after the dynamic import resolves.

type FirebaseConfig = typeof import('../firebase/config');
let _config: Promise<FirebaseConfig> | null = null;

function loadFirebase(): Promise<FirebaseConfig> {
  return (_config ??= import('../firebase/config'));
}

export function subscribeToAudienceCount(cb: (count: number) => void): () => void {
  let unsubscribe: (() => void) | undefined;

  loadFirebase().then(({ db, doc, onSnapshot }) => {
    const statsRef = doc(db, 'stats', 'siteStats');
    unsubscribe = onSnapshot(
      statsRef,
      (snap) => {
        const data = snap.data();
        if (typeof data?.audienceCount === 'number') cb(data.audienceCount);
      },
      () => { /* silent — UI shows hardcoded fallback */ },
    );
  });

  return () => { unsubscribe?.(); };
}

/**
 * Called only on first registration of a new user.
 * - If stats doc doesn't exist or has no audienceCount: initialises to 2452 (2451 + this user).
 * - If doc exists with a number: atomically increments by 1.
 * Login and logout never call this.
 */
export async function ensureAudienceCounterAndIncrement(): Promise<void> {
  try {
    const { db, doc, getDoc, setDoc, increment } = await loadFirebase();
    const statsRef = doc(db, 'stats', 'siteStats');
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
