import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  linkWithPopup,
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
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export type UserRole  = 'user' | 'admin';
export type Messenger = 'whatsapp' | 'telegram';

export interface UserProfile {
  displayName:     string;
  email:           string;
  phone:           string;
  phoneVerified?:  boolean;
  phoneMessenger?: Messenger;
  birthday?:       string;       // 'YYYY-MM-DD'
  birthdayFromFb?: boolean;
  socialLink:      string;
  facebookLinked?: boolean;
  photoURL?:       string;
  provider?:       'email' | 'google' | 'facebook';
  notifications:   boolean;
  role:            UserRole;
}

interface AuthContextType {
  user:             User | null;
  userProfile:      UserProfile | null;
  loading:          boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail:  (email: string, password: string) => Promise<void>;
  signUpWithEmail:  (email: string, password: string, name: string) => Promise<void>;
  logout:           () => Promise<void>;
  resetPassword:    (email: string) => Promise<void>;
  saveProfile:      (data: Partial<UserProfile>) => Promise<void>;
  linkFacebook:     () => Promise<{ name?: string; birthday?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Firestore helpers ──────────────────────────────────────────────────────────

// Always writes updatedAt — never exposes API key to frontend
async function upsertProfile(uid: string, data: Partial<UserProfile> & Record<string, unknown>) {
  await setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

function defaultProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    displayName: '', email: '', phone: '',
    phoneVerified: false, phoneMessenger: 'whatsapp',
    birthday: '', birthdayFromFb: false,
    socialLink: '', facebookLinked: false,
    notifications: true, role: 'user',
    ...overrides,
  };
}

// Resolves provider string from Firebase providerData
function resolveProvider(firebaseUser: import('firebase/auth').User): UserProfile['provider'] {
  const pid = firebaseUser.providerData[0]?.providerId;
  return pid === 'google.com' ? 'google' : 'email';
}

/**
 * Ensures users/{uid} document exists and is up-to-date.
 *
 * - Document exists   → updates lastLoginAt + backfills missing photoURL/provider.
 *                       NEVER overwrites role, phone, displayName or any user-set field.
 * - Document missing  → creates a fresh document with role:'user'.
 *                       Safe for orphaned Auth accounts and first-time Google users.
 *
 * Returns the profile as it exists in Firestore (pre-update snapshot for existing docs).
 */
async function ensureUserDocument(firebaseUser: import('firebase/auth').User): Promise<UserProfile> {
  const ref  = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    // Only merge safe system fields — never touch role or user-edited data
    const updates: Record<string, unknown> = { lastLoginAt: serverTimestamp() };
    if (!existing.photoURL && firebaseUser.photoURL) updates.photoURL  = firebaseUser.photoURL;
    if (!existing.provider)                          updates.provider   = resolveProvider(firebaseUser);
    await upsertProfile(firebaseUser.uid, updates);  // also writes updatedAt
    return existing;
  }

  // Document missing — create with all required fields
  const profile = defaultProfile({
    displayName: firebaseUser.displayName ?? '',
    email:       firebaseUser.email ?? '',
    photoURL:    firebaseUser.photoURL ?? undefined,
    provider:    resolveProvider(firebaseUser),
  });
  await upsertProfile(firebaseUser.uid, {
    ...profile,
    createdAt:   serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });
  return profile;
}

// Converts Facebook birthday MM/DD/YYYY → YYYY-MM-DD
function parseFbBirthday(fb: string): string {
  const parts = fb.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return '';
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profile = await ensureUserDocument(firebaseUser);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
  }, []);

  // ── Save (merge into Firestore + local state) ──────────────────────────────
  async function saveProfile(data: Partial<UserProfile>) {
    if (!user) return;
    await upsertProfile(user.uid, data as Record<string, unknown>);
    setUserProfile(prev => (prev ? { ...prev, ...data } : defaultProfile(data)));
  }

  // ── Google sign-in ─────────────────────────────────────────────────────────
  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    // Always prompt account selection so users can switch accounts
    provider.setCustomParameters({ prompt: 'select_account' });
    const result  = await signInWithPopup(auth, provider);
    const profile = await ensureUserDocument(result.user);
    setUserProfile(profile);
  }

  // ── Email sign-in ──────────────────────────────────────────────────────────
  async function signInWithEmail(email: string, password: string) {
    const result  = await signInWithEmailAndPassword(auth, email, password);
    const profile = await ensureUserDocument(result.user);
    setUserProfile(profile);
  }

  // ── Email sign-up ──────────────────────────────────────────────────────────
  // Explicit write here (not ensureUserDocument) to guarantee the correct
  // displayName from the form field lands in Firestore before onAuthStateChanged
  // fires and potentially reads a still-null displayName from Auth.
  async function signUpWithEmail(email: string, password: string, name: string) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateProfile(result.user, { displayName: name });
    const profile = defaultProfile({ displayName: name, email, provider: 'email' });
    await upsertProfile(result.user.uid, {
      ...profile,
      createdAt:   serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    setUserProfile(profile);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function logout() {
    await firebaseSignOut(auth);
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  // ── Link Facebook + fetch name & birthday ─────────────────────────────────
  async function linkFacebook(): Promise<{ name?: string; birthday?: string }> {
    if (!user) throw new Error('Not authenticated');

    const fbProvider = new FacebookAuthProvider();
    fbProvider.addScope('user_birthday');
    fbProvider.addScope('public_profile');

    const result      = await linkWithPopup(user, fbProvider);
    const credential  = FacebookAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    let fbName:     string | undefined;
    let fbBirthday: string | undefined;

    if (accessToken) {
      try {
        const resp = await fetch(
          `https://graph.facebook.com/me?fields=name,birthday&access_token=${accessToken}`
        );
        if (resp.ok) {
          const data = await resp.json() as { name?: string; birthday?: string };
          fbName = data.name;
          if (data.birthday) fbBirthday = parseFbBirthday(data.birthday);
        }
      } catch {
        // Graph API failed — continue without birthday
      }
    }

    const updates: Partial<UserProfile> = { facebookLinked: true };

    const resolvedName = fbName ?? result.user.displayName ?? undefined;
    if (resolvedName) updates.displayName   = resolvedName;
    if (fbBirthday)   { updates.birthday    = fbBirthday; updates.birthdayFromFb = true; }

    if (resolvedName && !user.displayName) {
      await firebaseUpdateProfile(user, { displayName: resolvedName });
    }

    // Clear legacy malformed socialLink (old code saved access token as URL)
    const currentSocial = userProfile?.socialLink ?? '';
    if (currentSocial.startsWith('https://facebook.com/EAA')) {
      updates.socialLink = '';
    }

    await saveProfile(updates);
    return { name: resolvedName, birthday: fbBirthday };
  }

  return (
    <AuthContext.Provider value={{
      user, userProfile, loading,
      signInWithGoogle, signInWithEmail, signUpWithEmail,
      logout, resetPassword, saveProfile,
      linkFacebook,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
