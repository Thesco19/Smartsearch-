import React from 'react';
import { Shield, Radio, Volume2, VolumeX, Eye, Wifi } from 'lucide-react';

interface NavbarProps {
  activeMode: 'live' | 'sandbox' | 'benchmark';
  onChangeMode: (mode: 'live' | 'sandbox' | 'benchmark') => void;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  isAutoDetecting: boolean;
  analysisCount: number;
  onOpenScanner?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeMode,
  onChangeMode,
  isSoundEnabled,
  onToggleSound,
  isAutoDetecting,
  analysisCount,
  onOpenScanner,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 lg:px-6 py-3 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & System Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">SmartCam Engine</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700/50 text-indigo-300">
                v2.5 • Gemini 3.8 Flash
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Detector e Analista Visual Multi-Objeto em Tempo Real
            </p>
          </div>
        </div>

        {/* Center Mode Selector */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          <button
            id="nav-mode-live"
            onClick={() => onChangeMode('live')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'live'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Feed da Câmera
          </button>
          <button
            id="nav-mode-sandbox"
            onClick={() => onChangeMode('sandbox')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'sandbox'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sandbox SmartCam
          </button>
          <button
            id="nav-mode-benchmark"
            onClick={() => onChangeMode('benchmark')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeMode === 'benchmark'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Testes Automatizados
          </button>
        </div>

        {/* Live Status Indicators & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active status pulse */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isAutoDetecting ? 'bg-emerald-400' : 'bg-slate-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isAutoDetecting ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </span>
            <span className={isAutoDetecting ? 'text-emerald-400' : 'text-slate-400'}>
              {isAutoDetecting ? 'STREAM AO VIVO' : 'PRONTO'}
            </span>
          </div>

          {/* Frames processed counter */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 font-mono">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>{analysisCount} {analysisCount === 1 ? 'frame' : 'frames'}</span>
          </div>

          {/* Network Camera Scanner quick button */}
          {onOpenScanner && (
            <button
              id="navbar-network-scanner-btn"
              onClick={onOpenScanner}
              title="Buscar câmeras IP na rede local (Hikvision, Intelbras, Dahua, ONVIF, RTSP)"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-200 hover:text-white flex items-center gap-1.5 transition-all"
            >
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Buscar Câmeras</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            id="toggle-sound-button"
            onClick={onToggleSound}
            title={isSoundEnabled ? "Desativar alertas sonoros" : "Ativar alertas sonoros"}
            className={`p-2 rounded-md border transition-colors ${
              isSoundEnabled
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};

