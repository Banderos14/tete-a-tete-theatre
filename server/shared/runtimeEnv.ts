// В каком окружении работает сервер — одно место на весь серверный слой.
//
// Признак production — VERCEL_ENV === 'production'. Его выставляет сам Vercel
// для production-деплоя, забыть или перепутать его нельзя. Всё, что не
// production (preview-деплой ветки develop, `vercel dev`, тесты без явной
// настройки), считается staging-подобным окружением и работает в безопасном
// режиме: не трогает production Firebase, не пишет реальным зрителям,
// не принимает live-ключи Stripe.
//
// APP_ENV — только метка для людей (тема письма, логи), решений по нему
// не принимается.

/** Firebase-проект production. Staging-окружение к нему подключаться не должно. */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'theatre-tete-a-tete';

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** Метка окружения для писем и логов: STAGING, LOCAL и т.п. */
export function runtimeLabel(): string {
  const label = (process.env.APP_ENV ?? '').trim();
  return (label || 'staging').toUpperCase();
}

/**
 * Проверка Firebase-проекта перед подключением Admin SDK.
 *
 * Fail closed: вне production подключение к production-проекту запрещено,
 * даже если туда по ошибке положили production service account.
 */
export function assertFirebaseProjectAllowed(projectId: string): void {
  if (!isProductionRuntime() && projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new Error(
      `Refusing to connect to production Firebase project "${projectId}" outside production ` +
      `(VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`,
    );
  }
}
