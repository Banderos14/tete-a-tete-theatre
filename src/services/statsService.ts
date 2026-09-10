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
  }).catch(() => {
    // Firebase не загрузился — счётчик некритичен, UI покажет запасное значение.
    // Без catch это остаётся unhandled rejection в консоли каждого посетителя.
  });

  return () => { unsubscribe?.(); };
}

/**
 * Отмечает нового зрителя в публичном счётчике.
 *
 * Инкремент выполняет сервер (/api/register-audience) и ровно один раз на
 * пользователя: раньше клиент вызывал его дважды при регистрации по e-mail
 * (гонка signUpWithEmail и onAuthStateChanged), а правила Firestore позволяли
 * любому авторизованному накручивать счётчик в цикле.
 *
 * Счётчик некритичен: любая ошибка молча игнорируется и регистрацию не ломает.
 */
export async function ensureAudienceCounterAndIncrement(getIdToken: () => Promise<string>): Promise<void> {
  try {
    const idToken = await getIdToken();
    await fetch('/api/register-audience', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  } catch {
    // best-effort: счётчик на лендинге не стоит того, чтобы ломать регистрацию
  }
}
