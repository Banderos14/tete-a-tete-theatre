// Аутентификация и авторизация серверных функций.
//
// Раньше каждый endpoint сам доставал токен, сам звал verifyIdToken и сам
// читал роль из Firestore — четыре почти одинаковые копии. Теперь это одно место.

import type { IncomingMessage } from 'node:http';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebaseAdmin.js';
import { bearerToken } from './http.js';
import { unauthorized, forbidden } from './errors.js';

export interface Caller {
  uid: string;
  /** Firebase ID token вызывающего — нужен там, где его проверяют повторно. */
  idToken: string;
}

/** uid вызывающего. Бросает 401, если токена нет или он недействителен. */
export async function requireCaller(req: IncomingMessage): Promise<Caller> {
  const idToken = bearerToken(req);
  if (!idToken) throw unauthorized('Authorization: Bearer <token> required');

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    return { uid: decoded.uid, idToken };
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

/**
 * Доступ планировщика Vercel к cron-endpoint'у.
 *
 * Fail closed: раньше проверка выглядела как `if (secret && ...)`, то есть
 * незаданная переменная окружения ОТКРЫВАЛА endpoint кому угодно. Теперь без
 * CRON_SECRET на сервере задача не выполняется вовсе.
 *
 * Оба отказа отдают одинаковый 401: разные коды подсказывали бы постороннему,
 * настроен секрет или нет. Само значение наружу не уходит и не логируется.
 */
export function requireCronSecret(req: IncomingMessage): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw unauthorized('Cron access denied');

  const authorization = String(req.headers['authorization'] ?? '');
  if (authorization !== `Bearer ${secret}`) throw unauthorized('Cron access denied');
}

/** Роль пользователя из Firestore. Источник правды для admin-проверок. */
export async function isAdminUid(uid: string): Promise<boolean> {
  try {
    const snap = await getFirestore(getAdminApp()).collection('users').doc(uid).get();
    return snap.exists && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

/** Вызывающий с ролью admin. Бросает 401/403. */
export async function requireAdmin(req: IncomingMessage, message = 'Admin only'): Promise<Caller> {
  const caller = await requireCaller(req);
  if (!await isAdminUid(caller.uid)) throw forbidden(message);
  return caller;
}

/** E-mail вызывающего из Firebase Auth (может отсутствовать). */
export async function callerEmail(uid: string): Promise<string | null> {
  try {
    const record = await getAuth(getAdminApp()).getUser(uid);
    return typeof record.email === 'string' ? record.email : null;
  } catch {
    return null;
  }
}
