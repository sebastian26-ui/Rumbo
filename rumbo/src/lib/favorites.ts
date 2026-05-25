import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface FavoritePlace {
  id: string;
  /** Nickname the user gave it ("Home", "Office"). */
  name: string;
  /** Full address / label returned from autocomplete. */
  label: string;
  /** Primary line (street + number, etc.). */
  primary: string;
  /** Optional secondary line (city / region). */
  secondary?: string;
  lat: number;
  lng: number;
  createdAt: number;
}

const PATH = (uid: string) => doc(db, 'users', uid, 'settings', 'favorites');

function sanitize(items: unknown): FavoritePlace[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (x): x is FavoritePlace =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as any).id === 'string' &&
      typeof (x as any).name === 'string' &&
      typeof (x as any).lat === 'number' &&
      typeof (x as any).lng === 'number',
  );
}

export async function loadFavorites(uid: string | null): Promise<FavoritePlace[]> {
  if (!uid) return [];
  try {
    const snap = await getDoc(PATH(uid));
    if (snap.exists()) {
      return sanitize((snap.data() as { items?: unknown }).items);
    }
  } catch (e) {
    console.warn('loadFavorites failed', e);
  }
  return [];
}

export async function saveFavorites(
  uid: string | null,
  items: FavoritePlace[],
): Promise<void> {
  if (!uid) return;
  try {
    await setDoc(PATH(uid), { items, updatedAt: Date.now() });
  } catch (e) {
    console.warn('saveFavorites failed', e);
  }
}

export function newFavoriteId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
