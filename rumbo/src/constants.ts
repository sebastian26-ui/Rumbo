import { ModeConfig } from './types';

export const MODES: ModeConfig[] = [
  {
    id: 'all',
    color: '#111827',
    title: 'Compare all modes',
    btnLabel: 'Pick a mode',
    icon: 'layers',
  },
  {
    id: 'carpool',
    color: '#3B82F6',
    title: 'Shared ride',
    btnLabel: 'Join Carpool',
    icon: 'car',
  },
  {
    id: 'walk',
    color: '#10B981',
    title: 'Walk route',
    btnLabel: 'Start Walking',
    icon: 'person-walking',
  },
  {
    id: 'transit',
    color: '#F59E0B',
    title: 'Transit',
    btnLabel: 'View Trip',
    icon: 'bus',
  },
  {
    id: 'bike',
    color: '#8B5CF6',
    title: 'Bike route',
    btnLabel: 'Unlock Bike',
    icon: 'bike',
  },
];

/** Metro de Santiago official line colors, used as fallback when Google's
 *  `transit_details.line.color` is missing. Match Google's `line.short_name`. */
export const METRO_LINE_COLORS: Record<string, string> = {
  L1: '#E10E0E',
  L2: '#FFCB02',
  L3: '#8B4513',
  L4: '#1F4598',
  L4A: '#00A4E4',
  L5: '#00A859',
  L6: '#8E2C8E',
};
