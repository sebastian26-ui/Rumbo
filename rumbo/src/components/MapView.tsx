import React, { useState } from 'react';
import MapCanvas from './MapCanvas';
import BottomPanel from './BottomPanel';
import { Mode } from '../types';
import { MODES } from '../constants';
import { Search, User as UserIcon, MapPin, Navigation, ArrowRight, X } from 'lucide-react';

interface MapViewProps {
  user: any;
}

export default function MapView({ user }: MapViewProps) {
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [startLocation, setStartLocation] = useState('');
  const [isRouteVisible, setIsRouteVisible] = useState(false);
  
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const activeConfig = activeMode ? MODES.find(m => m.id === activeMode)! : null;

  const handleCloseMode = () => {
    setActiveMode(null);
    setIsRouteVisible(false);
    setStartLocation('');
    setEstimates([]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startLocation.trim()) {
      setLoading(true);
      setIsRouteVisible(true);
      if (!activeMode) setActiveMode('carpool');

      try {
        const response = await fetch('/api/estimates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: 'Current Location', end: startLocation })
        });
        const data = await response.json();
        setEstimates(data.estimates);
      } catch (error) {
        console.error("Error fetching estimates:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="h-screen w-full bg-white overflow-hidden relative font-sans">
      {/* Map Background */}
      <MapCanvas activeMode={activeMode} />

      {/* Top Bar - Search & Profile */}
      <div className="absolute top-0 left-0 right-0 p-4 z-40">
        <div className="flex items-center gap-3">
          <form 
            onSubmit={handleSearch}
            className="flex-1 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 p-2 flex flex-col gap-1"
          >
            {isRouteVisible ? (
              <div className="flex flex-col gap-2 px-2 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">Current Location</p>
                    <p className="text-sm font-bold text-gray-900 truncate">My Current Location</p>
                  </div>
                </div>
                <div className="h-[1px] bg-gray-100 ml-5.5" />
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">Destination</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{startLocation}</p>
                  </div>
                  <button 
                    type="button"
                    onClick={handleCloseMode}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="pl-3 text-blue-500">
                  <MapPin size={18} />
                </div>
                <input 
                  type="text" 
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="Where to?" 
                  className="flex-1 bg-transparent border-none outline-none text-gray-900 font-bold placeholder:text-gray-400 py-2"
                />
                <button 
                  type="submit"
                  className="bg-blue-500 text-white p-2.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            )}
          </form>
          <div className="w-14 h-14 bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/40 flex items-center justify-center overflow-hidden self-start">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={24} className="text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Floating Chips - Transport Options (Only visible if route is active) */}
      {isRouteVisible && (
        <div className="absolute top-20 left-0 right-0 px-4 flex gap-2 overflow-x-auto no-scrollbar z-40 py-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl shadow-md border transition-all duration-300 whitespace-nowrap
                ${activeMode === mode.id 
                  ? 'bg-white border-transparent' 
                  : 'bg-white/80 backdrop-blur-sm border-gray-100 text-gray-500'}
              `}
              style={{ 
                color: activeMode === mode.id ? mode.color : undefined,
                borderColor: activeMode === mode.id ? mode.color : undefined
              }}
            >
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: mode.color }} 
              />
              <span className="text-sm font-bold capitalize">{mode.id}</span>
            </button>
          ))}
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-3 z-40">
        <button className="w-12 h-12 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 flex items-center justify-center text-gray-600 active:scale-95 transition-transform">
          <Navigation size={20} />
        </button>
      </div>

      {/* Bottom Sliding Panel */}
      <BottomPanel 
        config={activeConfig} 
        onClose={handleCloseMode}
        estimates={estimates}
        loading={loading}
      />
    </div>
  );
}
