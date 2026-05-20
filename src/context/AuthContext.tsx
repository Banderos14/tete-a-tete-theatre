import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export interface UserProfile {
  displayName: string;
  email: string;
  phone: string;
  socialLink: string;
  notifications: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  saveProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

async function createProfile(uid: string, data: Partial<UserProfile>) {
  await setDoc(doc(db, 'users', uid), {
    displayName: '',
    email: '',
    phone: '',
    socialLink: '',
    notifications: true,
    createdAt: serverTimestamp(),
    ...data,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profile = await fetchProfile(firebaseUser.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
  }, []);

  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const { user: u } = result;
    const existing = await fetchProfile(u.uid);
    if (!existing) {
      const profile = { displayName: u.displayName ?? '', email: u.email ?? '' };
      await createProfile(u.uid, profile);
      setUserProfile({ phone: '', socialLink: '', notifications: true, ...profile });
    } else {
      setUserProfile(existing);
    }
  }

  async function signInWithEmail(email: string, password: string) {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchProfile(result.user.uid);
    setUserProfile(profile);
  }

  async function signUpWithEmail(email: string, password: string, name: string) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateProfile(result.user, { displayName: name });
    const profile = { displayName: name, email };
    await createProfile(result.user.uid, profile);
    setUserProfile({ phone: '', socialLink: '', notifications: true, ...profile });
  }

  async function logout() {
    await firebaseSignOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function saveProfile(data: Partial<UserProfile>) {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), data as Record<string, unknown>);
    setUserProfile(prev => (prev ? { ...prev, ...data } : null));
  }

  return (
    <AuthContext.Provider
      value={{
        user, userProfile, loading,
        signInWithGoogle, signInWithEmail, signUpWithEmail,
        logout, resetPassword, saveProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
