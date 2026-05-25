/**
 * Per-user trip personalization ("modos de preferencia").
 *
 * Eleven opt-in modes that tune the comparison view for accessibility,
 * lifestyle, or context. Stored per user in Firestore alongside the provider
 * toggles (same doc path style: users/{uid}/settings/preferences), with a
 * localStorage mirror so guests and offline sessions still work.
 *
 * This module is data + persistence only. The actual filtering / re-ranking
 * lives in lib/tripFilter.ts so it stays a pure function over a trip.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type PreferenceModeId =
  | 'mobility_reduced'
  | 'visual_impairment'
  | 'hearing_impairment'
  | 'fastest'
  | 'cheapest'
  | 'sustainable'
  | 'avoid_transfers'
  | 'minimal_walking'
  | 'safer_at_night'
  | 'traveling_with_kids'
  | 'heavy_luggage';

export type PreferenceCategory =
  | 'accessibility'
  | 'travel_style'
  | 'safety_context';

export interface PreferenceMode {
  id: PreferenceModeId;
  category: PreferenceCategory;
  /** Short Spanish label shown on toggles + pills. */
  label: string;
  /** One-line description of what it does. */
  description: string;
  /** Concrete use-case / example. */
  example: string;
  /** Emoji used on qualifying cards (badge), when the mode adds one. */
  badge?: string;
}

export const PREFERENCE_CATEGORY_LABEL: Record<PreferenceCategory, string> = {
  accessibility: 'Accesibilidad',
  travel_style: 'Estilo de viaje',
  safety_context: 'Seguridad y contexto',
};

/** Fixed display order for the three settings/onboarding groups. */
export const PREFERENCE_CATEGORY_ORDER: PreferenceCategory[] = [
  'accessibility',
  'travel_style',
  'safety_context',
];

export const PREFERENCE_MODES: PreferenceMode[] = [
  // ---- Accesibilidad
  {
    id: 'mobility_reduced',
    category: 'accessibility',
    label: 'Movilidad reducida',
    description:
      'Evita escaleras y caminatas largas, prioriza Metro con ascensor y buses de piso bajo.',
    example: 'Útil si usas silla de ruedas, andador o tienes dificultad para caminar.',
    badge: '♿',
  },
  {
    id: 'visual_impairment',
    category: 'accessibility',
    label: 'Discapacidad visual',
    description:
      'Prioriza rutas con menos transbordos y evita cambios de línea complejos en Metro.',
    example: 'Útil si tienes baja visión o ceguera y prefieres trayectos simples y directos.',
  },
  {
    id: 'hearing_impairment',
    category: 'accessibility',
    label: 'Discapacidad auditiva',
    description:
      'Prioriza rutas más directas, con menos dependencia de avisos sonoros.',
    example: 'Útil si eres sordo o tienes hipoacusia y prefieres no depender de anuncios hablados.',
  },
  // ---- Estilo de viaje
  {
    id: 'fastest',
    category: 'travel_style',
    label: 'Lo más rápido posible',
    description:
      'Ordena todo por tiempo total e ignora el costo. Oculta opciones muy lentas.',
    example: 'Útil si vas tarde a una reunión o tienes una conexión que tomar.',
  },
  {
    id: 'cheapest',
    category: 'travel_style',
    label: 'Lo más barato posible',
    description:
      'Ordena por precio total y promueve caminar, micro y buses gratuitos.',
    example: 'Útil si quieres ahorrar y no tienes apuro.',
  },
  {
    id: 'sustainable',
    category: 'travel_style',
    label: 'Lo más sustentable',
    description:
      'Prioriza caminar, bici, Metro y buses eléctricos. Muestra el CO₂ de cada opción.',
    example: 'Útil si quieres reducir tu huella de carbono en cada viaje.',
    badge: '🌱',
  },
  {
    id: 'avoid_transfers',
    category: 'travel_style',
    label: 'Evitar transbordos',
    description: 'Solo muestra rutas directas o con un transbordo como máximo.',
    example: 'Útil si te incomoda combinar varios buses o líneas de Metro.',
  },
  {
    id: 'minimal_walking',
    category: 'travel_style',
    label: 'Prefiero caminar poco',
    description:
      'Oculta opciones con más de 10 minutos de caminata y prefiere puerta a puerta.',
    example: 'Útil si te cansa caminar o llueve y no quieres mojarte.',
  },
  // ---- Seguridad y contexto
  {
    id: 'safer_at_night',
    category: 'safety_context',
    label: 'Más seguro de noche',
    description:
      'Después de las 22:00 prioriza Uber/Cabify sobre caminatas y buses por comunas con más incidentes.',
    example: 'Se activa solo de noche; puedes desactivarlo cuando quieras.',
  },
  {
    id: 'traveling_with_kids',
    category: 'safety_context',
    label: 'Viajando con niños',
    description:
      'Prefiere Metro y buses directos, y evita caminatas largas (más de 500 m).',
    example: 'Útil si viajas con niños pequeños o coche.',
  },
  {
    id: 'heavy_luggage',
    category: 'safety_context',
    label: 'Tengo equipaje pesado',
    description:
      'Evita caminatas largas, prefiere puerta a puerta y descarta la bicicleta.',
    example: 'Útil si llevas maletas, compras grandes o bultos pesados.',
  },
];

export const PREFERENCE_BY_ID: Record<PreferenceModeId, PreferenceMode> =
  PREFERENCE_MODES.reduce(
    (acc, m) => {
      acc[m.id] = m;
      return acc;
    },
    {} as Record<PreferenceModeId, PreferenceMode>,
  );

const VALID_IDS = new Set<PreferenceModeId>(PREFERENCE_MODES.map((m) => m.id));
const LOCAL_KEY = 'rumbo:preference-modes';

function sanitize(ids: unknown): PreferenceModeId[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (x): x is PreferenceModeId =>
      typeof x === 'string' && VALID_IDS.has(x as PreferenceModeId),
  );
}

function readLocal(): PreferenceModeId[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocal(ids: PreferenceModeId[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

export async function loadPreferenceModes(
  uid: string | null,
): Promise<PreferenceModeId[]> {
  if (!uid) return readLocal();
  try {
    const ref = doc(db, 'users', uid, 'settings', 'preferences');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as { modes?: unknown };
      const modes = sanitize(data.modes);
      writeLocal(modes);
      return modes;
    }
  } catch (e) {
    console.warn('loadPreferenceModes: falling back to local', e);
  }
  return readLocal();
}

export async function savePreferenceModes(
  uid: string | null,
  ids: PreferenceModeId[],
): Promise<void> {
  const clean = sanitize(ids);
  writeLocal(clean);
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid, 'settings', 'preferences'),
      { modes: clean, updatedAt: Date.now() },
      { merge: true },
    );
  } catch (e) {
    console.warn('savePreferenceModes: persisted locally only', e);
  }
}
