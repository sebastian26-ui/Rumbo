/**
 * Curated, citeable Metro de Santiago step-free / elevator accessibility.
 *
 * HONESTY NOTE — same discipline as the comuna risk data: this is NOT
 * real-time. Metro publishes a static accessible-stations reference; this is
 * a curated snapshot of it. We never claim live elevator status. Lines 3 and
 * 6 are modern and built fully step-free (every station has elevators); the
 * older lines expose only the stations Metro documents as accessible. A
 * station not in the list is treated as "sin dato", never as "inaccesible".
 *
 * Source: Metro de Santiago — Accesibilidad universal, https://www.metro.cl
 * (sección Accesibilidad). Verify ascensor status on metro.cl before travel.
 */

/** Lines built fully step-free — every station has elevator access. */
export const FULLY_ACCESSIBLE_METRO_LINES = new Set(['L3', 'L6']);

export const METRO_ACCESSIBILITY_LABEL =
  'Accesibilidad de estaciones según información general de Metro de Santiago. ' +
  'Verifica el estado de los ascensores en metro.cl antes de viajar.';

export const METRO_ACCESSIBILITY_SOURCE_URL = 'https://www.metro.cl';

/** Accent/case-insensitive key so Google/GTFS station-name variants match
 *  ("Tobalaba", "TOBALABA", "Estación Tobalaba" → "tobalaba"). */
function key(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^estaci[oó]n\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stations on the older lines (L1, L2, L4, L4A, L5) that Metro documents as
 * having elevator / step-free access. Intentionally conservative: omitting a
 * station means "no tenemos el dato", not "no accesible".
 */
const ACCESSIBLE_STATION_NAMES: string[] = [
  // L1
  'San Pablo',
  'Pajaritos',
  'Las Rejas',
  'Universidad de Santiago',
  'Estación Central',
  'Unión Latinoamericana',
  'República',
  'Los Héroes',
  'La Moneda',
  'Universidad de Chile',
  'Santa Lucía',
  'Universidad Católica',
  'Baquedano',
  'Salvador',
  'Manuel Montt',
  'Pedro de Valdivia',
  'Los Leones',
  'Tobalaba',
  'El Golf',
  'Alcántara',
  'Escuela Militar',
  'Manquehue',
  'Hernando de Magallanes',
  'Los Dominicos',
  // L2
  'Vespucio Norte',
  'Zapadores',
  'Cerro Blanco',
  'Patronato',
  'Puente Cal y Canto',
  'Santa Ana',
  'Parque O’Higgins',
  'Franklin',
  'El Llano',
  'San Miguel',
  'Lo Vial',
  'Departamental',
  'Ciudad del Niño',
  'Lo Ovalle',
  'El Parrón',
  'La Cisterna',
  // L4
  'Tobalaba',
  'Cristóbal Colón',
  'Francisco Bilbao',
  'Príncipe de Gales',
  'Simón Bolívar',
  'Plaza Egaña',
  'Los Orientales',
  'Grecia',
  'Vicente Valdés',
  'Macul',
  'Vespucio',
  'Rojas Magallanes',
  'Trinidad',
  'San José de la Estrella',
  'Los Quillayes',
  'Elisa Correa',
  'Hospital Sótero del Río',
  'Protectora de la Infancia',
  'Las Mercedes',
  'Plaza de Puente Alto',
  // L4A
  'La Cisterna',
  'San Ramón',
  'Santa Rosa',
  'La Granja',
  'Santa Julia',
  'Vicuña Mackenna',
  // L5
  'Plaza de Maipú',
  'Santiago Bueras',
  'Del Sol',
  'Monte Tabor',
  'Las Parcelas',
  'Laguna Sur',
  'Barrancas',
  'Pudahuel',
  'San Pablo',
  'Lo Prado',
  'Blanqueado',
  'Gruta de Lourdes',
  'Quinta Normal',
  'Cumming',
  'Santa Ana',
  'Plaza de Armas',
  'Bellas Artes',
  'Baquedano',
  'Parque Bustamante',
  'Santa Isabel',
  'Irarrázaval',
  'Ñuble',
  'Rodrigo de Araya',
  'Carlos Valdovinos',
  'Camino Agrícola',
  'San Joaquín',
  'Pedrero',
  'Mirador',
  'Bellavista de La Florida',
  'Vicente Valdés',
];

const ACCESSIBLE_KEYS = new Set(ACCESSIBLE_STATION_NAMES.map(key));

export type MetroAccessStatus = 'accessible' | 'unknown';

/**
 * Best-effort step-free status for a Metro stop. `lineShortName` is the
 * normalized line code ("L3", "L6", …) when known — whole-line-accessible
 * lines short-circuit. Returns 'unknown' (never 'inaccessible') when we lack
 * the datum, so the caller can label honestly rather than mislead.
 */
export function metroStopAccess(
  stopName: string | null | undefined,
  lineShortName: string | null | undefined,
): MetroAccessStatus {
  const line = (lineShortName || '').toUpperCase().replace(/\s+/g, '');
  if (line && FULLY_ACCESSIBLE_METRO_LINES.has(line)) return 'accessible';
  if (stopName && ACCESSIBLE_KEYS.has(key(stopName))) return 'accessible';
  return 'unknown';
}
