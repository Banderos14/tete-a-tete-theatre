import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { UserRole } from '../context/AuthContext';

export interface AdminUser {
  uid:          string;
  displayName:  string;
  email:        string;
  phone:        string;
  role:         UserRole;
  notifications: boolean;
  createdAt?:   { seconds: number } | null;
}

export async function getAllUsers(): Promise<AdminUser[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...(d.data() as Omit<AdminUser, 'uid'>) }));
}

export async function getUsersForNewsletter(): Promise<{ email: string; displayName: string }[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => d.data() as AdminUser)
    .filter(u => u.notifications === true && u.email && u.role !== 'admin')
    .map(u => ({ email: u.email, displayName: u.displayName || '' }));
}

export interface DeleteUserResult {
  userDeleted: boolean;
  authDeleted: boolean;
  bookingsDeletedCount: number;
}

/**
 * Calls the /api/delete-user Vercel function to completely remove a user:
 *   1. Firestore users/{uid}
 *   2. All bookings where userId === uid
 *   3. Firebase Auth user
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set in the Vercel environment.
 */
export async function deleteUserCompletely(uid: string): Promise<DeleteUserResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Not authenticated');

  const idToken  = await currentUser.getIdToken();
  const endpoint = (import.meta.env.VITE_DELETE_USER_ENDPOINT as string | undefined) ?? '/api/delete-user';
  const isLocal  = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid }),
  });

  if (res.status === 404 && isLocal) {
    throw new Error(
      'На localhost /api/delete-user недоступен через Vite dev server. ' +
      'Запустите vercel dev вместо npm run dev. ' +
      'Также убедитесь, что FIREBASE_SERVICE_ACCOUNT задан в .env.',
    );
  }

  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      `Delete user API вернул пустой ответ (HTTP ${res.status}). ` +
      'Проверьте, что Vercel function задеплоена и FIREBASE_SERVICE_ACCOUNT задан.',
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Delete user API вернул не-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return data as unknown as DeleteUserResult;
}
