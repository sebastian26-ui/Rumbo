import { ModeConfig } from './types';

export const MODES: ModeConfig[] = [
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
    id: 'bus',
    color: '#F59E0B',
    title: 'Bus route',
    btnLabel: 'View Schedule',
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
