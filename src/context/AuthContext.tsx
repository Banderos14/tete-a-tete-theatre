import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
// Type-only import — stripped at build time, no runtime firebase dependency.
import type { User } from 'firebase/auth';
import { ensureAudienceCounterAndIncrement } from '../services/statsService';

export type UserRole  = 'user' | 'admin';
export type Messenger = 'whatsapp' | 'telegram';

export interface UserProfile {
  displayName:     string;
  email:           string;
  phone:           string;
  phoneVerified?:  boolean;
  phoneMessenger?:   Messenger;
  preferredContact?: string[];   // multiselect: ['whatsapp', 'telegram']
  birthday?:         string;     // 'YYYY-MM-DD'
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

// Firebase is loaded lazily after first paint to keep it out of the critical JS path.
// The 344KB firebase chunk becomes an async dependency instead of a synchronous one,
// which allows the main bundle to execute without waiting for Firebase to download.
type FirebaseConfig = typeof import('../firebase/config');
let _config: Promise<FirebaseConfig> | null = null;

function loadFirebase(): Promise<FirebaseConfig> {
  return (_config ??= import('../firebase/config'));
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

function resolveProvider(firebaseUser: User): UserProfile['provider'] {
  const pid = firebaseUser.providerData[0]?.providerId;
  return pid === 'google.com' ? 'google' : 'email';
}

async function upsertProfile(uid: string, data: Partial<UserProfile> & Record<string, unknown>) {
  const { db, doc, setDoc, serverTimestamp } = await loadFirebase();
  await setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

async function ensureUserDocument(firebaseUser: User): Promise<UserProfile> {
  const { db, doc, getDoc, setDoc, serverTimestamp } = await loadFirebase();
  const ref  = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    const updates: Record<string, unknown> = { lastLoginAt: serverTimestamp() };
    if (!existing.photoURL && firebaseUser.photoURL) updates.photoURL  = firebaseUser.photoURL;
    if (!existing.provider)                          updates.provider   = resolveProvider(firebaseUser);
    await setDoc(ref, { ...updates, updatedAt: serverTimestamp() }, { merge: true });
    return existing;
  }

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
  void ensureAudienceCounterAndIncrement();
  return profile;
}

function parseFbBirthday(fb: string): string {
  const parts = fb.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    loadFirebase().then(({ auth, onAuthStateChanged }) => {
      if (!mounted) return;
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!mounted) return;
        setUser(firebaseUser);
        if (firebaseUser) {
          const profile = await ensureUserDocument(firebaseUser);
          if (mounted) setUserProfile(profile);
        } else {
          setUserProfile(null);
        }
        if (mounted) setLoading(false);
      });
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  async function saveProfile(data: Partial<UserProfile>) {
    if (!user) return;
    await upsertProfile(user.uid, data as Record<string, unknown>);
    setUserProfile(prev => (prev ? { ...prev, ...data } : defaultProfile(data)));
  }

  async function signInWithGoogle() {
    const { auth, GoogleAuthProvider, signInWithPopup } = await loadFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result  = await signInWithPopup(auth, provider);
    const profile = await ensureUserDocument(result.user);
    setUserProfile(profile);
  }

  async function signInWithEmail(email: string, password: string) {
    const { auth, signInWithEmailAndPassword } = await loadFirebase();
    const result  = await signInWithEmailAndPassword(auth, email, password);
    const profile = await ensureUserDocument(result.user);
    setUserProfile(profile);
  }

  async function signUpWithEmail(email: string, password: string, name: string) {
    const { auth, createUserWithEmailAndPassword, firebaseUpdateProfile } = await loadFirebase();
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateProfile(result.user, { displayName: name });
    const profile = defaultProfile({ displayName: name, email, provider: 'email' });
    await upsertProfile(result.user.uid, {
      ...profile,
      createdAt:   (await loadFirebase()).serverTimestamp(),
      lastLoginAt: (await loadFirebase()).serverTimestamp(),
    });
    void ensureAudienceCounterAndIncrement();
    setUserProfile(profile);
  }

  async function logout() {
    const { auth, firebaseSignOut } = await loadFirebase();
    await firebaseSignOut(auth);
  }

  async function resetPassword(email: string) {
    const { auth, sendPasswordResetEmail } = await loadFirebase();
    await sendPasswordResetEmail(auth, email);
  }

  async function linkFacebook(): Promise<{ name?: string; birthday?: string }> {
    if (!user) throw new Error('Not authenticated');

    const { FacebookAuthProvider, linkWithPopup } = await loadFirebase();
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
        // Graph API недоступен — продолжаем без даты рождения
      }
    }

    const updates: Partial<UserProfile> = { facebookLinked: true };

    const resolvedName = fbName ?? result.user.displayName ?? undefined;
    if (resolvedName) updates.displayName   = resolvedName;
    if (fbBirthday)   { updates.birthday    = fbBirthday; updates.birthdayFromFb = true; }

    if (resolvedName && !user.displayName) {
      const { firebaseUpdateProfile } = await loadFirebase();
      await firebaseUpdateProfile(user, { displayName: resolvedName });
    }

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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
