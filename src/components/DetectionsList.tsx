import React, { useState } from 'react';
import { User, Dog, Car, Package, Sparkles, Crosshair, ChevronRight } from 'lucide-react';
import { SmartCamDetection, DetectionCategory } from '../types';

interface DetectionsListProps {
  detections: SmartCamDetection[];
  selectedIndex: number | null;
  onSelectDetection: (index: number | null) => void;
}

export const DetectionsList: React.FC<DetectionsListProps> = ({
  detections,
  selectedIndex,
  onSelectDetection,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DetectionCategory | 'all'>('all');

  const filteredDetections = detections.filter(
    (d) => selectedCategory === 'all' || d.category === selectedCategory
  );

  const getCategoryIcon = (category: DetectionCategory) => {
    switch (category) {
      case 'person':
        return <User className="w-4 h-4 text-violet-400" />;
      case 'animal':
        return <Dog className="w-4 h-4 text-emerald-400" />;
      case 'vehicle':
        return <Car className="w-4 h-4 text-amber-400" />;
      default:
        return <Package className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getCategoryBadgeClass = (category: DetectionCategory) => {
    switch (category) {
      case 'person':
        return 'bg-violet-950/60 text-violet-300 border-violet-800/50';
      case 'animal':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
      case 'vehicle':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
      default:
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-full">
      {/* Header & Filter Controls */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">Alvos Detectados</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {detections.length}
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 text-xs">
          {(['all', 'person', 'animal', 'vehicle', 'object'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded text-[11px] capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat === 'all' ? 'Todos' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Detections List */}
      <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[360px]">
        {filteredDetections.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            {detections.length === 0
              ? 'Nenhuma entidade identificada no frame atual.'
              : 'Nenhum alvo nesta categoria específica.'}
          </div>
        ) : (
          filteredDetections.map((item, idx) => {
            const actualIndex = detections.indexOf(item);
            const isSelected = selectedIndex === actualIndex;
            const confPct = Math.round(
              item.confidence > 1 ? item.confidence : item.confidence * 100
            );

            return (
              <div
                key={actualIndex}
                onClick={() => onSelectDetection(isSelected ? null : actualIndex)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-indigo-500 shadow-md'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                {/* Title row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-slate-800 border border-slate-700/60">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 capitalize">
                        {item.label}
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded border uppercase font-medium ${getCategoryBadgeClass(
                            item.category
                          )}`}
                        >
                          {item.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Confidence meter */}
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-slate-200">{confPct}%</div>
                    <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${confPct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Attributes: Action State & Description */}
                <div className="mt-2 text-xs space-y-1 bg-slate-900/80 p-2 rounded border border-slate-800/60 font-sans">
                  <div className="text-slate-300 leading-snug">
                    <span className="text-slate-400 font-medium">Ação:</span>{' '}
                    <span className="text-indigo-200">{item.attributes.action_state}</span>
                  </div>
                  <div className="text-slate-300 leading-snug">
                    <span className="text-slate-400 font-medium">Detalhes:</span>{' '}
                    {item.attributes.description}
                  </div>
                </div>

                {/* Coordinates metadata footer */}
                <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-slate-400" />
                    BBox: [T: {item.bounding_box_relative.top.toFixed(2)}, L:{' '}
                    {item.bounding_box_relative.left.toFixed(2)}, B:{' '}
                    {item.bounding_box_relative.bottom.toFixed(2)}, R:{' '}
                    {item.bounding_box_relative.right.toFixed(2)}]
                  </span>
                  <span className="text-indigo-400 flex items-center gap-0.5">
                    {isSelected ? 'Selecionado' : 'Destacar'}
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
