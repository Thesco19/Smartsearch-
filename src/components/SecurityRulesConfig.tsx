import React from 'react';
import { ShieldCheck, HelpCircle, SlidersHorizontal, Info } from 'lucide-react';
import { SecurityPreset } from '../types';
import { securityPresets } from '../data/presets';

interface SecurityRulesConfigProps {
  activePresetId: string;
  onSelectPreset: (preset: SecurityPreset) => void;
  customContext: string;
  onChangeCustomContext: (val: string) => void;
}

export const SecurityRulesConfig: React.FC<SecurityRulesConfigProps> = ({
  activePresetId,
  onSelectPreset,
  customContext,
  onChangeCustomContext,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">Regras e Políticas de Segurança</h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Diretrizes da IA</span>
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {securityPresets.map((preset) => {
          const isSelected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset)}
              className={`text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950'
                  : 'bg-slate-950/50 border-slate-800 hover:bg-slate-800/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                  {preset.name}
                </span>
                {isSelected && <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Custom Security Context Directive */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
          <span>Instrução Adicional de Alerta (Opcional):</span>
          <span className="text-[10px] text-slate-500">Ex: "Alerta HIGH para portas abertas"</span>
        </label>
        <input
          type="text"
          value={customContext}
          onChange={(e) => onChangeCustomContext(e.target.value)}
          placeholder="Ex: Área restrita após às 22h, reportar se houver animais perto dos veículos..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* System Directives Info Bar */}
      <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 flex items-start gap-2.5 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong className="text-slate-300">Filtro de Ruído Ativo:</strong> Vento em árvores, variações de luz solar e sombras são ignorados. O foco é estritamente em entidades físicas (Pessoas, Animais, Veículos e Objetos) e alertas acionáveis.
          </p>
        </div>
      </div>
    </div>
  );
};
