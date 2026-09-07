import React, { useState } from 'react';
import { Code2, Copy, Check, Download, Zap } from 'lucide-react';
import { SmartCamAnalysisResponse } from '../types';

interface TelemetryDrawerProps {
  data: SmartCamAnalysisResponse | null;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  // Clean formatted JSON
  const jsonString = JSON.stringify(
    {
      timestamp: data.timestamp,
      detections: data.detections,
      event_alert: data.event_alert,
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcam_frame_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">Saída JSON Estrita (Schema)</h2>
        </div>

        <div className="flex items-center gap-2">
          {data.processing_time_ms && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{data.processing_time_ms}ms</span>
            </div>
          )}

          <button
            id="copy-json-button"
            onClick={handleCopy}
            className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700 text-xs flex items-center gap-1"
            title="Copiar JSON estrito"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>

          <button
            id="download-json-button"
            onClick={handleDownload}
            className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700 text-xs flex items-center gap-1"
            title="Baixar JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Code Block Container */}
      <div className="mt-3 flex-1 bg-slate-950 rounded-lg p-3 border border-slate-800/80 font-mono text-xs overflow-auto max-h-[360px] text-slate-300 leading-relaxed select-text">
        <pre className="text-[11px] text-indigo-200">
          <code>{jsonString}</code>
        </pre>
      </div>
    </div>
  );
};
