import React, { useState, useEffect } from 'react';
import { motion, useAnimation, PanInfo } from 'motion/react';
import { ModeConfig } from '../types';
import { ChevronUp, ChevronDown, MapPin, Clock, Leaf, DollarSign, Flame, Footprints, Users, X } from 'lucide-react';

interface BottomPanelProps {
  config: ModeConfig | null;
  onClose: () => void;
  estimates?: any[];
  loading?: boolean;
}

type PanelState = 'collapsed' | 'half' | 'full';

const STAT_ICONS: Record<string, any> = {
  'Travel Time': Clock,
  'Walking Time': Clock,
  'Total Time': Clock,
  'Cycling Time': Clock,
  'CO₂ Saved': Leaf,
  'Money Saved': DollarSign,
  'Fare': DollarSign,
  'Calories': Flame,
  'Steps': Footprints,
  'Occupancy': Users,
};

export default function BottomPanel({ config, onClose, estimates = [], loading = false }: BottomPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('collapsed');
  const controls = useAnimation();

  useEffect(() => {
    if (config) {
      setPanelState('half');
    } else {
      setPanelState('collapsed');
    }
  }, [config]);

  useEffect(() => {
    controls.start(panelState);
  }, [panelState, controls]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const { offset, velocity } = info;
    const swipeThreshold = 50;
    const velocityThreshold = 500;

    if (velocity.y > velocityThreshold || offset.y > swipeThreshold) {
      if (panelState === 'full') setPanelState('half');
      else if (panelState === 'half') {
        setPanelState('collapsed');
        // Removed onClose() call here to keep mode active
      }
    } else if (velocity.y < -velocityThreshold || offset.y < -swipeThreshold) {
      if (panelState === 'collapsed') setPanelState('half');
      else if (panelState === 'half') setPanelState('full');
    } else {
      // Snap back to current state if threshold not met
      controls.start(panelState);
    }
  };

  if (!config) return (
    <motion.div 
      className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] z-50 p-4 flex flex-col items-center border-t border-white/20"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      style={{ height: '80px' }}
    >
      <div className="w-12 h-1.5 bg-gray-300/50 rounded-full mb-4" />
      <p className="text-gray-400 font-medium">Where to?</p>
    </motion.div>
  );

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.05}
      onDragEnd={handleDragEnd}
      animate={controls}
      variants={{
        collapsed: { y: 'calc(100% - 80px)' },
        half: { y: '50%' },
        full: { y: '10%' }
      }}
      transition={{ type: 'spring', damping: 35, stiffness: 350, mass: 0.8 }}
      className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-2xl rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] z-50 flex flex-col overflow-hidden border-t border-white/30"
      style={{ height: '100%' }}
    >
      {/* Handle & Close */}
      <div className="w-full pt-4 pb-2 flex flex-col items-center relative cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 bg-gray-300/60 rounded-full mb-2" />
        <button 
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 bg-gray-100/80 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-12 custom-scrollbar">
        <div className="flex items-center justify-between mb-8 mt-2">
          <div className="max-w-[70%]">
            <h2 className="text-2xl font-extrabold text-gray-900 leading-tight mb-1">
              {config.title}
            </h2>
            <p className="text-gray-500 font-semibold text-sm">{config.sub}</p>
          </div>
          <div 
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl transform rotate-3"
            style={{ backgroundColor: config.color }}
          >
            <MapPin size={28} />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {config.stats.map((stat, i) => {
            const Icon = STAT_ICONS[stat.key] || Clock;
            return (
              <div key={i} className="bg-white/40 rounded-2xl p-3 border border-white/50 flex flex-col items-center text-center shadow-sm">
                <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                  <Icon size={12} className="opacity-70" />
                  <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap opacity-60">{stat.key}</span>
                </div>
                <div className="text-sm font-black text-gray-900">{stat.value}</div>
              </div>
            );
          })}
        </div>

        {/* Routes List */}
        <div className="space-y-4 mb-10">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">Recommended Routes</h3>
          </div>
          {config.routes.map((route, i) => (
            <div 
              key={i} 
              className="bg-white/60 rounded-[1.5rem] p-5 border border-white/80 shadow-sm flex items-center justify-between hover:border-gray-200 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: config.color }} />
                <div>
                  <div className="font-bold text-gray-900 leading-none mb-1.5">{route.name}</div>
                  <div className="text-[11px] text-gray-400 font-medium">{route.time || route.distance} • {route.detail}</div>
                </div>
              </div>
              {route.badge && (
                <span 
                  className="text-[9px] font-black px-2.5 py-1.5 rounded-xl uppercase tracking-wider"
                  style={{ backgroundColor: `${config.color}15`, color: config.color }}
                >
                  {route.badge}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Ride-Hailing Comparison (Only for carpool/car modes) */}
        {(config.id === 'carpool') && (
          <div className="space-y-4 mb-10">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">Live Price Comparison</h3>
              {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {estimates.length > 0 ? (
                estimates.map((est, i) => {
                  const isBest = i === 0; // Assuming sorted by price in backend
                  return (
                    <div 
                      key={i}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                        isBest ? 'bg-blue-50/50 border-blue-200' : 'bg-white/60 border-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm"
                          style={{ backgroundColor: est.color }}
                        >
                          {est.provider[0]}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{est.provider} {est.type}</div>
                          <div className="text-xs text-gray-500 font-medium">{est.eta} min away</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-gray-900">${est.price.toLocaleString()}</div>
                        {isBest && (
                          <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider bg-blue-100 px-2 py-0.5 rounded-lg">
                            Best Price
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                !loading && <div className="text-center py-4 text-gray-400 text-sm font-medium">No active estimates found</div>
              )}
            </div>
          </div>
        )}

        {/* Start Button */}
        <button
          className="w-full py-5 px-6 text-white font-black text-lg rounded-[1.5rem] shadow-2xl transition-all active:scale-95 mb-6 flex items-center justify-center gap-3"
          style={{ 
            backgroundColor: config.color,
            boxShadow: `0 10px 25px -5px ${config.color}66`
          }}
        >
          {config.btnLabel}
        </button>
      </div>
    </motion.div>
  );
}
