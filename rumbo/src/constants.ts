import { ModeConfig } from './types';

export const MODES: ModeConfig[] = [
  {
    id: 'carpool',
    color: '#3B82F6', // Blue
    title: 'Shared ride available',
    sub: '3 neighbors on your route',
    routes: [
      { name: 'Downtown Express', time: '12:45 PM', badge: 'Fastest' },
      { name: 'Suburban Link', time: '1:15 PM', badge: 'Eco' }
    ],
    stats: [
      { key: 'Travel Time', value: '22 min' },
      { key: 'CO₂ Saved', value: '1.4 kg' },
      { key: 'Money Saved', value: '$4.50' }
    ],
    btnLabel: 'Join Carpool',
    icon: 'car'
  },
  {
    id: 'walk',
    color: '#10B981', // Green
    title: 'Healthy walk to station',
    sub: '15 min to Central Park',
    routes: [
      { name: 'Main Street Path', distance: '1.1 km', detail: 'Well lit' },
      { name: 'Park Shortcut', distance: '0.8 km', detail: 'Scenic' }
    ],
    stats: [
      { key: 'Walking Time', value: '15 min' },
      { key: 'Calories', value: '85 kcal' },
      { key: 'Steps', value: '1,240' }
    ],
    btnLabel: 'Start Walking',
    icon: 'person-walking'
  },
  {
    id: 'bus',
    color: '#F59E0B', // Orange
    title: 'Bus arriving in 4 min',
    sub: 'Route 42 - North Station',
    routes: [
      { name: 'Line 42 → Central', time: '12:42 PM', detail: 'High frequency' },
      { name: 'Line 45 → East', time: '12:55 PM', detail: 'Medium frequency' }
    ],
    stats: [
      { key: 'Total Time', value: '35 min' },
      { key: 'Fare', value: '$2.50' },
      { key: 'Occupancy', value: 'Low' }
    ],
    btnLabel: 'View Schedule',
    icon: 'bus'
  },
  {
    id: 'bike',
    color: '#8B5CF6', // Purple
    title: 'Bike share nearby',
    sub: '8 bikes at 5th Ave',
    routes: [
      { name: 'Cycle Path A', distance: '2.4 km', detail: 'Protected lane' },
      { name: 'River Trail', distance: '3.1 km', detail: 'Flat' }
    ],
    stats: [
      { key: 'Cycling Time', value: '12 min' },
      { key: 'CO₂ Saved', value: '0.8 kg' },
      { key: 'Calories', value: '120 kcal' }
    ],
    btnLabel: 'Unlock Bike',
    icon: 'bike'
  }
];
