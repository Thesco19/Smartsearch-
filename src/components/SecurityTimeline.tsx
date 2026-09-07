import React from 'react';
import { History, Trash2, ArrowUpRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { SecurityEventRecord } from '../types';

interface SecurityTimelineProps {
  records: SecurityEventRecord[];
  activeRecordId: string | null;
  onSelectRecord: (record: SecurityEventRecord) => void;
  onClearHistory: () => void;
}

export const SecurityTimeline: React.FC<SecurityTimelineProps> = ({
  records,
  activeRecordId,
  onSelectRecord,
  onClearHistory,
}) => {
  if (records.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">Linha do Tempo de Incidentes</h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {records.length}
          </span>
        </div>

        <button
          onClick={onClearHistory}
          className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
          title="Limpar histórico"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Limpar</span>
        </button>
      </div>

      {/* Timeline entries grid / list */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
        {records.map((rec) => {
          const isSelected = activeRecordId === rec.id;
          const isTriggered = rec.analysis.event_alert.triggered;
          const severity = rec.analysis.event_alert.severity;

          const badgeClasses = {
            high: 'bg-red-500/20 text-red-300 border-red-500/40',
            medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
            low: 'bg-slate-800 text-slate-400 border-slate-700',
          }[severity] || 'bg-slate-800 text-slate-400 border-slate-700';

          return (
            <div
              key={rec.id}
              onClick={() => onSelectRecord(rec)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-800 border-indigo-500 shadow-md'
                  : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border uppercase font-semibold ${badgeClasses}`}>
                    {severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(rec.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-200 mt-2 line-clamp-2 leading-snug">
                  {rec.analysis.event_alert.summary}
                </p>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[120px] text-[10px] font-mono text-slate-500">
                  {rec.sourceName}
                </span>
                <span className="text-[10px] font-mono text-indigo-400 flex items-center gap-0.5">
                  {rec.analysis.detections.length} alvos
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
