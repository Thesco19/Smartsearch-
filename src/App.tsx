import React, { useState, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { AlertBanner } from './components/AlertBanner';
import { CameraViewport } from './components/CameraViewport';
import { SmartCamSandbox } from './components/SmartCamSandbox';
import { SmartCamTestSuite } from './components/SmartCamTestSuite';
import { DetectionsList } from './components/DetectionsList';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import { SecurityRulesConfig } from './components/SecurityRulesConfig';
import { SecurityTimeline } from './components/SecurityTimeline';
import {
  SmartCamAnalysisResponse,
  SecurityEventRecord,
  SecurityPreset,
  NetworkCamera,
} from './types';
import { securityPresets } from './data/presets';
import { soundSynthesizer } from './utils/audioAlert';
import { AlertCircle } from 'lucide-react';
import { CameraIntelligencePanel } from './components/CameraIntelligencePanel';

export default function App() {
  const [activeMode, setActiveMode] = useState<'live' | 'network_ai' | 'sandbox' | 'benchmark'>('live');
  const [externalCameraToView, setExternalCameraToView] = useState<NetworkCamera | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<SmartCamAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoIntervalSeconds, setAutoIntervalSeconds] = useState(3);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState<number | null>(null);
  const [records, setRecords] = useState<SecurityEventRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<SecurityPreset>(securityPresets[0]);
  const [customContext, setCustomContext] = useState('');
  const [currentSourceName, setCurrentSourceName] = useState('SmartCam-Sandbox [Varanda]');
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detections' | 'telemetry'>('detections');

  // Analyze frame via server endpoint
  const handleAnalyzeFrame = useCallback(
    async (base64Image: string, timestamp: string, sourceName: string) => {
      setIsAnalyzing(true);
      setApiError(null);
      setCurrentSourceName(sourceName);

      try {
        const fullContext = [
          activePreset.instructionContext,
          customContext ? `Observação específica: ${customContext}` : '',
        ]
          .filter(Boolean)
          .join(' ');

        const response = await fetch('/api/analyze-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image,
            timestamp,
            securityContext: fullContext,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Erro HTTP ${response.status} na análise`);
        }

        const data: SmartCamAnalysisResponse = await response.json();
        setCurrentAnalysis(data);
        setSelectedDetectionIndex(null);

        // Sound alert
        if (isSoundEnabled && data.event_alert) {
          if (data.event_alert.triggered) {
            soundSynthesizer.playAlert(data.event_alert.severity);
          }
        }

        // Add to history timeline
        const newRecord: SecurityEventRecord = {
          id: `evt_${Date.now()}`,
          timestamp: data.timestamp || timestamp,
          analysis: data,
          sourceType: sourceName.toLowerCase().includes('webcam')
            ? 'webcam'
            : sourceName.toLowerCase().includes('cam')
            ? 'sample'
            : 'upload',
          sourceName,
        };

        setRecords((prev) => [newRecord, ...prev.slice(0, 19)]);
        setActiveRecordId(newRecord.id);
      } catch (err: any) {
        console.error('Erro ao analisar frame:', err);
        setApiError(err.message || 'Falha ao processar o frame.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [activePreset, customContext, isSoundEnabled]
  );

  // Load analysis from benchmark test case into live workspace
  const handleSelectTestAnalysis = (analysis: SmartCamAnalysisResponse, testTitle: string) => {
    setCurrentAnalysis(analysis);
    setCurrentSourceName(`Teste: ${testTitle}`);
    setSelectedDetectionIndex(null);
    setActiveTab('detections');
    // Switch to sandbox so user can see bounding boxes and inspection
    setActiveMode('sandbox');
  };

  // Restore past record from timeline
  const handleSelectRecord = (record: SecurityEventRecord) => {
    setActiveRecordId(record.id);
    setCurrentAnalysis(record.analysis);
    setCurrentSourceName(record.sourceName);
    setSelectedDetectionIndex(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeMode={activeMode}
        onChangeMode={setActiveMode}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={() => setIsSoundEnabled(!isSoundEnabled)}
        isAutoDetecting={isAutoDetecting}
        analysisCount={records.length}
        onOpenScanner={() => setActiveMode('live')}
      />

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-4">
        {/* Error notification banner if any */}
        {apiError && (
          <div className="bg-red-950/80 border border-red-500/50 rounded-xl p-3 flex items-center justify-between text-red-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="text-red-400 hover:text-red-200 underline font-mono text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Live Event Alert Banner */}
        <AlertBanner
          alert={currentAnalysis?.event_alert || null}
          timestamp={currentAnalysis?.timestamp}
          sourceName={currentSourceName}
        />

        {/* Mode: Autonomous Camera Intelligence & Auto-Connection */}
        {activeMode === 'network_ai' ? (
          <div className="space-y-4">
            <CameraIntelligencePanel
              activeCameraId={externalCameraToView?.id}
              onSelectCameraToView={(camera) => {
                setExternalCameraToView(camera);
                setActiveMode('live');
              }}
            />
          </div>
        ) : activeMode === 'benchmark' ? (
          <div className="space-y-4">
            <SmartCamTestSuite onSelectTestAnalysis={handleSelectTestAnalysis} />
          </div>
        ) : (
          /* Mode: Live Feed or Sandbox */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left / Center Viewport (7 cols on desktop) */}
            <div className="lg:col-span-7 flex flex-col">
              {activeMode === 'sandbox' ? (
                <SmartCamSandbox
                  onAnalyzeFrame={handleAnalyzeFrame}
                  isAnalyzing={isAnalyzing}
                  currentAnalysis={currentAnalysis}
                  selectedDetectionIndex={selectedDetectionIndex}
                  onSelectDetection={setSelectedDetectionIndex}
                />
              ) : (
                <CameraViewport
                  onAnalyzeFrame={handleAnalyzeFrame}
                  isAnalyzing={isAnalyzing}
                  currentAnalysis={currentAnalysis}
                  isAutoDetecting={isAutoDetecting}
                  onToggleAutoDetect={setIsAutoDetecting}
                  autoIntervalSeconds={autoIntervalSeconds}
                  onChangeAutoInterval={setAutoIntervalSeconds}
                  selectedDetectionIndex={selectedDetectionIndex}
                  onSelectDetection={setSelectedDetectionIndex}
                  externalSelectedCamera={externalCameraToView}
                  onOpenIntelligencePanel={() => setActiveMode('network_ai')}
                />
              )}
            </div>

            {/* Right Sidebar: Detections & JSON Telemetry (5 cols on desktop) */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {/* Tab switch */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-lg">
                <button
                  id="tab-detections"
                  onClick={() => setActiveTab('detections')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === 'detections'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Alvos Detectados ({currentAnalysis?.detections?.length || 0})
                </button>
                <button
                  id="tab-telemetry"
                  onClick={() => setActiveTab('telemetry')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === 'telemetry'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Esquema JSON (Estrito)
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-[380px]">
                {activeTab === 'detections' ? (
                  <DetectionsList
                    detections={currentAnalysis?.detections || []}
                    selectedIndex={selectedDetectionIndex}
                    onSelectDetection={setSelectedDetectionIndex}
                  />
                ) : (
                  <TelemetryDrawer data={currentAnalysis} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Security Rules & Context Directive */}
        <SecurityRulesConfig
          activePresetId={activePreset.id}
          onSelectPreset={setActivePreset}
          customContext={customContext}
          onChangeCustomContext={setCustomContext}
        />

        {/* History Audit Timeline */}
        <SecurityTimeline
          records={records}
          activeRecordId={activeRecordId}
          onSelectRecord={handleSelectRecord}
          onClearHistory={() => {
            setRecords([]);
            setActiveRecordId(null);
          }}
        />
      </main>
    </div>
  );
}

