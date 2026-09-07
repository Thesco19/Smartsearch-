import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Zap,
  RotateCcw,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SecurityTestCase, TestExecutionResult, SmartCamAnalysisResponse } from '../types';
import { smartCamTestCases } from '../data/testCases';
import { renderSandboxFrame } from '../utils/sandboxRenderer';

interface SmartCamTestSuiteProps {
  onSelectTestAnalysis: (analysis: SmartCamAnalysisResponse, testTitle: string) => void;
}

export const SmartCamTestSuite: React.FC<SmartCamTestSuiteProps> = ({ onSelectTestAnalysis }) => {
  const [testResults, setTestResults] = useState<Record<string, TestExecutionResult>>({});
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [activeRunningId, setActiveRunningId] = useState<string | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Helper to generate a test frame on an off-screen canvas
  const generateTestFrameBase64 = (test: SecurityTestCase): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const { scene, lighting, weather, entities } = test.sceneSetup;
    renderSandboxFrame(ctx, 960, 540, scene, lighting, weather, entities, 10, 1);
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  // Run a single test case
  const executeTestCase = async (test: SecurityTestCase): Promise<TestExecutionResult> => {
    setActiveRunningId(test.id);

    // Initial pending state
    const pendingResult: TestExecutionResult = {
      testId: test.id,
      title: test.title,
      status: 'running',
      detectionsCount: 0,
      alertTriggered: false,
      schemaValid: false,
      validationErrors: [],
    };
    setTestResults((prev) => ({ ...prev, [test.id]: pendingResult }));

    const startTime = performance.now();

    try {
      const base64Image = generateTestFrameBase64(test);
      const timestamp = new Date().toISOString();

      const response = await fetch('/api/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          timestamp,
          securityContext: test.sceneSetup.customNote || '',
        }),
      });

      const elapsed = Math.round(performance.now() - startTime);

      if (!response.ok) {
        throw new Error(`Erro na API: status ${response.status}`);
      }

      const data: SmartCamAnalysisResponse = await response.json();

      // Validate Schema
      const validationErrors: string[] = [];
      let schemaValid = true;

      if (!data.timestamp) {
        schemaValid = false;
        validationErrors.push('Campo "timestamp" ausente.');
      }
      if (!Array.isArray(data.detections)) {
        schemaValid = false;
        validationErrors.push('Campo "detections" não é um array.');
      } else {
        data.detections.forEach((d, idx) => {
          if (!['person', 'animal', 'object', 'vehicle'].includes(d.category)) {
            validationErrors.push(`Detecção #${idx}: Categoria inválida "${d.category}".`);
            schemaValid = false;
          }
          if (
            !d.bounding_box_relative ||
            typeof d.bounding_box_relative.top !== 'number' ||
            typeof d.bounding_box_relative.left !== 'number'
          ) {
            validationErrors.push(`Detecção #${idx}: Bounding box inválido.`);
            schemaValid = false;
          }
        });
      }

      if (!data.event_alert || typeof data.event_alert.triggered !== 'boolean') {
        schemaValid = false;
        validationErrors.push('Campo "event_alert" inválido.');
      }

      // Check Business / Security Rules
      let passed = schemaValid;

      // Check Alert Expectation
      if (test.shouldTriggerAlert && !data.event_alert.triggered) {
        passed = false;
        validationErrors.push(`Esperava alerta disparado (triggered: true), mas retornou false.`);
      }

      if (!test.shouldTriggerAlert && data.event_alert.triggered) {
        passed = false;
        validationErrors.push(`Esperava nenhum alerta disparado (triggered: false), mas disparou alerta.`);
      }

      // Check Category Expectation if specified
      if (test.expectedCategory !== 'none') {
        const hasCategory = data.detections.some((d) => d.category === test.expectedCategory);
        if (!hasCategory) {
          passed = false;
          validationErrors.push(`Alvo de categoria "${test.expectedCategory}" não foi detectado.`);
        }
      } else {
        // For empty scenes / noise filtering, ideally detections list should be empty
        if (data.detections.length > 1) {
          validationErrors.push(`Cenário de ruído/vazio detectou ${data.detections.length} alvos inesperados.`);
        }
      }

      const finalResult: TestExecutionResult = {
        testId: test.id,
        title: test.title,
        status: passed ? 'passed' : 'failed',
        latencyMs: elapsed,
        detectionsCount: data.detections?.length || 0,
        alertTriggered: data.event_alert?.triggered || false,
        alertSeverity: data.event_alert?.severity,
        alertSummary: data.event_alert?.summary,
        schemaValid,
        validationErrors,
        rawResponse: data,
      };

      setTestResults((prev) => ({ ...prev, [test.id]: finalResult }));
      setActiveRunningId(null);
      return finalResult;
    } catch (err: any) {
      const failedResult: TestExecutionResult = {
        testId: test.id,
        title: test.title,
        status: 'failed',
        latencyMs: Math.round(performance.now() - startTime),
        detectionsCount: 0,
        alertTriggered: false,
        schemaValid: false,
        validationErrors: [err.message || 'Falha de conexão'],
      };
      setTestResults((prev) => ({ ...prev, [test.id]: failedResult }));
      setActiveRunningId(null);
      return failedResult;
    }
  };

  // Run all tests sequentially
  const handleRunAllTests = async () => {
    setIsRunningAll(true);
    for (const test of smartCamTestCases) {
      await executeTestCase(test);
    }
    setIsRunningAll(false);
  };

  // Export report
  const handleExportReport = () => {
    const resultsList = Object.values(testResults) as TestExecutionResult[];
    const report = {
      benchmark_date: new Date().toISOString(),
      summary: {
        total_tests: smartCamTestCases.length,
        passed: resultsList.filter((r) => r.status === 'passed').length,
        failed: resultsList.filter((r) => r.status === 'failed').length,
      },
      results: testResults,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcam_benchmark_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats calculation
  const resultsList = Object.values(testResults) as TestExecutionResult[];
  const totalCount = smartCamTestCases.length;
  const executedCount = resultsList.length;
  const passedCount = resultsList.filter((r) => r.status === 'passed').length;
  const failedCount = resultsList.filter((r) => r.status === 'failed').length;
  const avgLatency =
    executedCount > 0
      ? Math.round(
          resultsList.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0) / executedCount
        )
      : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Bateria de Testes & Benchmark Automatizado</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Testa conformidade com o esquema JSON estrito, detecção multi-classe, regras de alerta e filtragem de ruído.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAllTests}
            disabled={isRunningAll || Boolean(activeRunningId)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
          >
            <Play className={`w-3.5 h-3.5 ${isRunningAll ? 'animate-spin' : ''}`} />
            <span>{isRunningAll ? 'Executando Testes...' : 'Executar Todos os Testes'}</span>
          </button>

          {executedCount > 0 && (
            <button
              onClick={handleExportReport}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700 text-xs flex items-center gap-1"
              title="Exportar Relatório em JSON"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Card Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400">Total de Casos</span>
          <div className="text-lg font-bold font-mono text-slate-200 mt-0.5">
            {executedCount} / {totalCount}
          </div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-emerald-400">Aprovados (Pass)</span>
          <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">{passedCount}</div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-rose-400">Falhas (Fail)</span>
          <div className="text-lg font-bold font-mono text-rose-300 mt-0.5">{failedCount}</div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
          <span className="text-[11px] text-cyan-400">Latência Média</span>
          <div className="text-lg font-bold font-mono text-cyan-300 mt-0.5">
            {avgLatency > 0 ? `${avgLatency}ms` : '--'}
          </div>
        </div>
      </div>

      {/* Test Cases Table / List */}
      <div className="space-y-2.5">
        {smartCamTestCases.map((test, index) => {
          const res = testResults[test.id];
          const isRunning = activeRunningId === test.id;
          const isExpanded = expandedTestId === test.id;

          return (
            <div
              key={test.id}
              className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 transition-all hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-200">{test.title}</span>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Foco: {test.targetFocus}
                    </span>
                    {test.shouldTriggerAlert && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Alerta Requerido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{test.description}</p>
                </div>

                {/* Right action & status badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {res ? (
                    res.status === 'running' ? (
                      <span className="text-xs font-mono text-indigo-400 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 animate-bounce" /> Testando...
                      </span>
                    ) : res.status === 'passed' ? (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/50 border border-emerald-800/60 px-2 py-1 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5" /> APROVADO ({res.latencyMs}ms)
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-rose-400 flex items-center gap-1 bg-rose-950/50 border border-rose-800/60 px-2 py-1 rounded">
                        <XCircle className="w-3.5 h-3.5" /> FALHOU
                      </span>
                    )
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Pendente</span>
                  )}

                  <button
                    onClick={() => executeTestCase(test)}
                    disabled={isRunning || isRunningAll}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors border border-slate-700 text-xs"
                    title="Executar este teste individualmente"
                  >
                    <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                  </button>

                  {res?.rawResponse && (
                    <button
                      onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700"
                      title="Ver detalhes do resultado"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Result Details */}
              {isExpanded && res && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-slate-400">
                    <div>
                      Alvos Detectados: <span className="text-slate-200 font-bold">{res.detectionsCount}</span> | Alerta
                      Disparado:{' '}
                      <span className={res.alertTriggered ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                        {res.alertTriggered ? `SIM (${res.alertSeverity})` : 'NÃO'}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (res.rawResponse) {
                          onSelectTestAnalysis(res.rawResponse, test.title);
                        }
                      }}
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Carregar no Viewport e Telemetria
                    </button>
                  </div>

                  {res.alertSummary && (
                    <p className="text-slate-300 bg-slate-900 p-2 rounded border border-slate-800 font-mono text-[11px]">
                      <strong>Resumo do Alerta:</strong> "{res.alertSummary}"
                    </p>
                  )}

                  {res.validationErrors.length > 0 && (
                    <div className="bg-rose-950/40 border border-rose-800/60 rounded p-2 text-rose-300 text-[11px] space-y-0.5 font-mono">
                      <div className="font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        Critérios não atendidos:
                      </div>
                      {res.validationErrors.map((err, i) => (
                        <div key={i}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
