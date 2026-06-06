import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase/config';
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
