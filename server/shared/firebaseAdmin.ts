// Единая инициализация Firebase Admin SDK для всех serverless-функций.

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { assertFirebaseProjectAllowed } from './runtimeEnv.js';

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sa: Record<string, any>;
  try { sa = JSON.parse(raw); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }

  // Vercel хранит переменные одной строкой — в private_key приходит литеральный \n.
  if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');

  if (!sa.project_id)   throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id');
  if (!sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email');
  if (!sa.private_key)  throw new Error('FIREBASE_SERVICE_ACCOUNT is missing private_key');

  // Staging никогда не подключается к production-базе: проверка ДО initializeApp.
  assertFirebaseProjectAllowed(String(sa.project_id));

  return initializeApp({ credential: cert(sa) });
}
