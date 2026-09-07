import React from 'react';
import { AlertTriangle, CheckCircle, Bell, Smartphone, Clock } from 'lucide-react';
import { SmartCamEventAlert } from '../types';

interface AlertBannerProps {
  alert: SmartCamEventAlert | null;
  timestamp?: string;
  sourceName?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alert, timestamp, sourceName }) => {
  if (!alert) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-300">Central de Notificações Push</div>
            <div className="text-xs text-slate-500">Aguardando análise do primeiro frame de segurança...</div>
          </div>
        </div>
      </div>
    );
  }

  const severityConfig = {
    high: {
      border: 'border-red-500/40 bg-red-950/40',
      badge: 'bg-red-500/20 text-red-300 border-red-500/40',
      icon: 'text-red-400',
      label: 'ALERTA CRÍTICO (HIGH)',
      indicatorColor: 'bg-red-500',
    },
    medium: {
      border: 'border-amber-500/40 bg-amber-950/30',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: 'text-amber-400',
      label: 'ATENÇÃO (MEDIUM)',
      indicatorColor: 'bg-amber-500',
    },
    low: {
      border: 'border-slate-700/60 bg-slate-900/80',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: 'text-slate-400',
      label: 'NORMAL (LOW)',
      indicatorColor: 'bg-slate-500',
    },
  };

  const config = severityConfig[alert.severity] || severityConfig.low;
  const isTriggered = alert.triggered;

  return (
    <div className={`rounded-xl border ${isTriggered ? config.border : 'border-slate-800 bg-slate-900'} p-4 transition-all duration-300`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Main Alert Message */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isTriggered ? (alert.severity === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400') : 'bg-emerald-500/10 text-emerald-400'
          }`}>
            {isTriggered ? (
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${config.badge}`}>
                {config.label}
              </span>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${isTriggered ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40' : 'bg-slate-800 text-slate-400'}`}>
                {isTriggered ? 'DISPARADO (TRIGGERED)' : 'SEM DISPARO'}
              </span>
              {timestamp && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-slate-100 mt-1.5">
              {alert.summary || (isTriggered ? "Evento de segurança registrado" : "Nenhum alvo de interesse no perímetro.")}
            </div>
          </div>
        </div>

        {/* Push Notification Simulation Capsule */}
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-2.5 max-w-sm shrink-0 flex items-start gap-2.5 shadow-inner">
          <div className="w-6 h-6 rounded-md bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
            <Smartphone className="w-3.5 h-3.5" />
          </div>
          <div className="text-left overflow-hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-400">Push Notification</span>
              <span className="text-[10px] text-slate-500 font-mono">agora</span>
            </div>
            <p className="text-xs text-slate-200 truncate mt-0.5 font-sans">
              <span className="font-semibold text-slate-100">{sourceName || "SmartCam"}: </span>
              {alert.summary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
