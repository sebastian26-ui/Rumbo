import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_ENABLED, PROVIDERS, ProviderId } from './providers';

const LOCAL_KEY = 'rumbo:enabled-providers';
const VALID_IDS = new Set<ProviderId>(PROVIDERS.map((p) => p.id));

function sanitize(ids: unknown): ProviderId[] {
  if (!Array.isArray(ids)) return [...DEFAULT_ENABLED];
  const filtered = ids.filter((x): x is ProviderId =>
    typeof x === 'string' && VALID_IDS.has(x as ProviderId),
  );
  return filtered.length ? filtered : [...DEFAULT_ENABLED];
}

function readLocal(): ProviderId[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [...DEFAULT_ENABLED];
    return sanitize(JSON.parse(raw));
  } catch {
    return [...DEFAULT_ENABLED];
  }
}

function writeLocal(ids: ProviderId[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

export async function loadEnabledProviders(uid: string | null): Promise<ProviderId[]> {
  if (!uid) return readLocal();

  try {
    const ref = doc(db, 'users', uid, 'settings', 'providers');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as { enabled?: unknown };
      const enabled = sanitize(data.enabled);
      writeLocal(enabled);
      return enabled;
    }
  } catch (e) {
    console.warn('loadEnabledProviders: falling back to local', e);
  }
  return readLocal();
}

export interface UserProfile {
  name?: string;
  email?: string;
  city?: string;
  onboardingComplete?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export async function loadUserProfile(uid: string | null): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return snap.data() as UserProfile;
  } catch (e) {
    console.warn('loadUserProfile failed', e);
  }
  return null;
}

export async function saveUserProfile(
  uid: string | null,
  patch: Partial<UserProfile>,
): Promise<void> {
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      { ...patch, updatedAt: Date.now() },
      { merge: true },
    );
  } catch (e) {
    console.warn('saveUserProfile failed', e);
  }
}

export async function saveEnabledProviders(
  uid: string | null,
  ids: ProviderId[],
): Promise<void> {
  const clean = sanitize(ids);
  writeLocal(clean);
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'settings', 'providers'), {
      enabled: clean,
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.warn('saveEnabledProviders: persisted locally only', e);
  }
}
