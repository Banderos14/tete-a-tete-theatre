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

export type UserRole = 'user' | 'admin';
export type Messenger = 'whatsapp' | 'telegram';

export interface UserProfile {
  displayName:     string;
  email:           string;
  phone:           string;
  phoneVerified?:  boolean;
  phoneMessenger?: Messenger;
  birthday?:       string;        // 'YYYY-MM-DD'
  birthdayFromFb?: boolean;       // true if auto-filled from Facebook
  socialLink:      string;
  facebookLinked?: boolean;
  notifications:   boolean;
  role:            UserRole;
}

interface AuthContextType {
  user:              User | null;
  userProfile:       UserProfile | null;
  loading:           boolean;
  signInWithGoogle:  () => Promise<void>;
  signInWithEmail:   (email: string, password: string) => Promise<void>;
  signUpWithEmail:   (email: string, password: string, name: string) => Promise<void>;
  logout:            () => Promise<void>;
  resetPassword:     (email: string) => Promise<void>;
  saveProfile:       (data: Partial<UserProfile>) => Promise<void>;
  linkFacebook: () => Promise<{ name?: string; birthday?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Firestore helpers ──────────────────────────────────────────────────────────

async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

async function upsertProfile(uid: string, data: Partial<UserProfile> & Record<string, unknown>) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
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

// Convert Facebook birthday MM/DD/YYYY → YYYY-MM-DD
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
        const profile = await fetchProfile(firebaseUser.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
  }, []);

  // ── Save (create-or-merge) ──
  async function saveProfile(data: Partial<UserProfile>) {
    if (!user) return;
    await upsertProfile(user.uid, data as Record<string, unknown>);
    setUserProfile(prev => (prev ? { ...prev, ...data } : defaultProfile(data)));
  }

  // ── Google sign-in ──
  async function signInWithGoogle() {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const u = result.user;
    const existing = await fetchProfile(u.uid);
    if (!existing) {
      const profile = defaultProfile({ displayName: u.displayName ?? '', email: u.email ?? '' });
      await upsertProfile(u.uid, { ...profile, createdAt: serverTimestamp() });
      setUserProfile(profile);
    } else {
      setUserProfile(existing);
    }
  }

  // ── Email sign-in ──
  async function signInWithEmail(email: string, password: string) {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchProfile(result.user.uid);
    if (profile) {
      setUserProfile(profile);
    } else {
      // First login — profile might not exist yet
      const fresh = defaultProfile({ email, displayName: result.user.displayName ?? '' });
      await upsertProfile(result.user.uid, { ...fresh, createdAt: serverTimestamp() });
      setUserProfile(fresh);
    }
  }

  // ── Email sign-up ──
  async function signUpWithEmail(email: string, password: string, name: string) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateProfile(result.user, { displayName: name });
    const profile = defaultProfile({ displayName: name, email });
    await upsertProfile(result.user.uid, { ...profile, createdAt: serverTimestamp() });
    setUserProfile(profile);
  }

  // ── Logout ──
  async function logout() {
    await firebaseSignOut(auth);
  }

  // ── Reset password ──
  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  // ── Link Facebook + fetch name & birthday ──
  async function linkFacebook(): Promise<{ name?: string; birthday?: string }> {
    if (!user) throw new Error('Not authenticated');

    const provider = new FacebookAuthProvider();
    provider.addScope('user_birthday');
    provider.addScope('public_profile');

    const result = await linkWithPopup(user, provider);
    const credential = FacebookAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    let fbName: string | undefined;
    let fbBirthday: string | undefined;

    // Fetch name + birthday from Graph API using the access token
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
        // Graph API call failed — continue without birthday
      }
    }

    const updates: Partial<UserProfile> = { facebookLinked: true };

    // Prefer Graph API name; fall back to what Firebase Auth received from FB
    const resolvedName = fbName ?? result.user.displayName ?? undefined;
    if (resolvedName) updates.displayName = resolvedName;
    if (fbBirthday)   { updates.birthday = fbBirthday; updates.birthdayFromFb = true; }

    // Also update Firebase Auth displayName so the header shows the correct name
    if (resolvedName && !user.displayName) {
      await firebaseUpdateProfile(user, { displayName: resolvedName });
    }

    // Clear any legacy malformed socialLink (old code saved accessToken as URL)
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
