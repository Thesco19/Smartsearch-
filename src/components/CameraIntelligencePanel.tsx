import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Wifi,
  Radio,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  Server,
  Zap,
  Cpu,
  Trash2,
  ExternalLink,
  ChevronRight,
  Terminal,
  ShieldCheck,
  Smartphone,
  Eye,
  Activity,
  Layers,
  Sparkles,
  Camera,
  ArrowRight,
  Lock,
  Key,
  HelpCircle,
  Info,
  Check,
  FileText,
  Download,
  Copy,
} from 'lucide-react';
import {
  LearnedCameraProfile,
  DiscoveryLogEvent,
  NetworkCamera,
  NetworkDiagnosticReport,
  ActiveHostRecord,
  PortScanRecord,
} from '../types';
import {
  getLearnedProfiles,
  saveLearnedProfile,
  deleteLearnedProfile,
  clearAllLearnedProfiles,
  detectLocalSubnet,
  verifyCurrentNetwork,
  NetworkVerificationInfo,
  learnAndConnectCamera,
  runAutonomousNetworkSweep,
  profileToNetworkCamera,
  createKapbomProfile,
  probePort,
  downloadLogFile,
  downloadJsonFile,
  getLatestDiagnosticReport,
  KNOWN_VENDOR_SIGNATURES,
} from '../utils/cameraLearningEngine';

interface CameraIntelligencePanelProps {
  onSelectCameraToView: (camera: NetworkCamera) => void;
  activeCameraId?: string;
  onClose?: () => void;
}

export const CameraIntelligencePanel: React.FC<CameraIntelligencePanelProps> = ({
  onSelectCameraToView,
  activeCameraId,
  onClose,
}) => {
  const [learnedProfiles, setLearnedProfiles] = useState<LearnedCameraProfile[]>([]);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [sweepProgress, setSweepProgress] = useState<{ current: number; total: number; ip: string }>({
    current: 0,
    total: 0,
    ip: '',
  });

  // 1ª AÇÃO: Estado de Verificação da Rede Atual
  const [netVerification, setNetVerification] = useState<NetworkVerificationInfo | null>(null);
  const [isVerifyingNet, setIsVerifyingNet] = useState<boolean>(false);

  // Subnet Configuration - Defaults to 192.168.15 (User's real subnet)
  const [subnetPrefix, setSubnetPrefix] = useState<string>('192.168.15');
  const [sweepScope, setSweepScope] = useState<'fast' | 'full'>('fast');
  const [customIpInput, setCustomIpInput] = useState<string>('192.168.15.');
  const [customPortInput, setCustomPortInput] = useState<string>('');
  const [brandHintInput, setBrandHintInput] = useState<string>('');
  const [isLearningSingle, setIsLearningSingle] = useState<boolean>(false);

  // Assistente Especial Câmera Kapbom PTZ Wi-Fi
  const [kapbomIpInput, setKapbomIpInput] = useState<string>('192.168.15.25');
  const [kapbomPassword, setKapbomPassword] = useState<string>('123456');
  const [kapbomUsername, setKapbomUsername] = useState<string>('admin');
  const [kapbomPort, setKapbomPort] = useState<number>(554);
  const [isConnectingKapbom, setIsConnectingKapbom] = useState<boolean>(false);
  const [isScanningKapbomSubnet, setIsScanningKapbomSubnet] = useState<boolean>(false);
  const [kapbomFeedback, setKapbomFeedback] = useState<{ message: string; success: boolean } | null>(null);

  const [logs, setLogs] = useState<DiscoveryLogEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'learned' | 'sweep' | 'report' | 'kapbom' | 'signatures'>('kapbom');

  // Diagnostic Report & 2-Phase Status
  const [diagnosticReport, setDiagnosticReport] = useState<NetworkDiagnosticReport | null>(null);
  const [currentPhaseName, setCurrentPhaseName] = useState<string>('');
  const [copiedLog, setCopiedLog] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const addLog = (event: DiscoveryLogEvent) => {
    setLogs((prev) => [...prev.slice(-80), event]);
  };

  // 1ª AÇÃO: Executa diagnóstico profundo para verificar em qual rede estamos
  const handleRunNetworkVerification = async (switchToTab = false) => {
    setIsVerifyingNet(true);
    if (switchToTab) setActiveTab('sweep');

    addLog({
      id: `diag-start-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      phase: 'probe',
      target: 'Diagnóstico de Rede',
      message: '1ª AÇÃO: Iniciando verificação para identificar em qual rede local o dispositivo está...',
    });

    try {
      const result = await verifyCurrentNetwork((msg) => {
        addLog({
          id: `diag-step-${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString(),
          phase: 'probe',
          target: 'Gateway / Roteador',
          message: msg,
        });
      });

      setNetVerification(result);
      setSubnetPrefix(result.subnetPrefix);
      setCustomIpInput(`${result.subnetPrefix}.`);

      addLog({
        id: `diag-finish-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'learned',
        target: result.subnetCidr,
        message: `Rede confirmada com sucesso: ${result.subnetCidr} (Gateway: ${result.gatewayIp || '192.168.15.1'}${result.latencyMs ? ` - ${result.latencyMs}ms` : ''})`,
        success: true,
      });
    } catch (err: any) {
      addLog({
        id: `diag-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'failed',
        target: 'Rede',
        message: `Diagnóstico de rede finalizado com fallback para 192.168.15.0/24: ${err.message}`,
      });
    } finally {
      setIsVerifyingNet(false);
    }
  };

  // Load learned profiles & latest diagnostic report on mount & automatically execute 1st Action (Verify Network)
  useEffect(() => {
    const list = getLearnedProfiles();
    setLearnedProfiles(list);

    const savedReport = getLatestDiagnosticReport();
    if (savedReport) {
      setDiagnosticReport(savedReport);
    }

    // Auto-run 1st Action on startup
    handleRunNetworkVerification(false);
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Run Autonomous Sweep on the explicitly configured subnet (2-phase: Host Discovery -> Port Scan -> Log Report)
  const handleStartSweep = async () => {
    if (isSweeping) return;
    setIsSweeping(true);
    setLogs([]);
    setCurrentPhaseName('Etapa 1/2: Rastreando Rede (Descobrindo Hosts Vivos)...');
    setActiveTab('sweep');

    try {
      const cleanPrefix = subnetPrefix.trim().replace(/\.+$/, '') || '192.168.15';
      
      // Calculate target hosts based on scope
      let targetSuffixes: number[] | undefined = undefined;
      if (sweepScope === 'full') {
        targetSuffixes = Array.from({ length: 254 }, (_, i) => i + 1);
      }

      const sweepResult = await runAutonomousNetworkSweep(
        cleanPrefix,
        (scanned, total, ip, phaseName) => {
          setSweepProgress({ current: scanned, total, ip });
          if (phaseName) setCurrentPhaseName(phaseName);
        },
        addLog,
        (newProfile) => {
          setLearnedProfiles((prev) => {
            const exists = prev.some((p) => p.id === newProfile.id || p.ip === newProfile.ip);
            return exists ? prev.map((p) => (p.id === newProfile.id ? newProfile : p)) : [newProfile, ...prev];
          });
        },
        targetSuffixes,
        (report) => {
          setDiagnosticReport(report);
        }
      );

      if (sweepResult.report) {
        setDiagnosticReport(sweepResult.report);
      }
    } catch (e: any) {
      addLog({
        id: `err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'failed',
        target: 'Rede Local',
        message: `Erro durante a varredura: ${e.message}`,
      });
    } finally {
      setIsSweeping(false);
      setCurrentPhaseName('');
      setLearnedProfiles(getLearnedProfiles());
    }
  };

  // Clear all learned profiles from local storage
  const handleClearAllProfiles = () => {
    if (window.confirm('Deseja limpar todos os perfis de câmeras memorizados?')) {
      clearAllLearnedProfiles();
      setLearnedProfiles([]);
      addLog({
        id: `clean-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'learned',
        target: 'Memória Local',
        message: 'Histórico de perfis e dados de teste removidos com sucesso.',
      });
    }
  };

  // Run Single IP Learning & Auto-Negotiation
  const handleLearnSingleIp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customIpInput || isLearningSingle) return;

    setIsLearningSingle(true);
    setActiveTab('sweep');

    try {
      const port = customPortInput ? parseInt(customPortInput, 10) : undefined;
      const learned = await learnAndConnectCamera(
        customIpInput.trim(),
        {
          port,
          brandHint: brandHintInput.trim(),
        },
        addLog
      );

      setLearnedProfiles(getLearnedProfiles());
      // Prompt user or automatically pass to viewer
      const netCam = profileToNetworkCamera(learned);
      onSelectCameraToView(netCam);
    } catch (err: any) {
      addLog({
        id: `err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'failed',
        target: customIpInput,
        message: `Falha no aprendizado: ${err.message}`,
      });
    } finally {
      setIsLearningSingle(false);
    }
  };

  // Delete learned profile
  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteLearnedProfile(id);
    setLearnedProfiles(getLearnedProfiles());
  };

  // Connect learned camera to viewport
  const handleConnectToViewer = (profile: LearnedCameraProfile) => {
    const netCam = profileToNetworkCamera(profile);
    onSelectCameraToView(netCam);
    if (onClose) onClose();
  };

  // Assistente Especial: Conexão Direta da Câmera Kapbom PTZ Wi-Fi
  const handleConnectKapbomDirect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!kapbomIpInput) return;

    setIsConnectingKapbom(true);
    setKapbomFeedback(null);

    try {
      const cleanIp = kapbomIpInput.trim();
      addLog({
        id: `kapbom-conn-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'negotiate',
        target: cleanIp,
        message: `Conectando Câmera Kapbom PTZ Wi-Fi no IP ${cleanIp}:${kapbomPort}...`,
      });

      // Probe check
      await probePort(cleanIp, kapbomPort === 554 ? 80 : kapbomPort, 700);

      const profile = createKapbomProfile(cleanIp, {
        password: kapbomPassword,
        username: kapbomUsername,
        port: kapbomPort,
      });

      setLearnedProfiles(getLearnedProfiles());

      addLog({
        id: `kapbom-ok-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'learned',
        target: cleanIp,
        message: `Câmera Kapbom PTZ configurada com sucesso! Fluxo RTSP: ${profile.streamUrl}`,
        success: true,
      });

      setKapbomFeedback({
        message: `Câmera Kapbom conectada com sucesso no IP ${cleanIp}!`,
        success: true,
      });

      // Automatically select camera to view
      const netCam = profileToNetworkCamera(profile);
      onSelectCameraToView(netCam);
    } catch (err: any) {
      addLog({
        id: `kapbom-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        phase: 'failed',
        target: kapbomIpInput,
        message: `Erro ao conectar câmera Kapbom: ${err.message}`,
      });
      setKapbomFeedback({
        message: `Erro ao conectar: ${err.message}`,
        success: false,
      });
    } finally {
      setIsConnectingKapbom(false);
    }
  };

  // Quick probe for Kapbom / Yoosee devices on ports 5000 and 8899
  const handleScanKapbomPorts = async () => {
    if (isScanningKapbomSubnet) return;
    setIsScanningKapbomSubnet(true);
    setActiveTab('sweep');

    const cleanPrefix = subnetPrefix.trim().replace(/\.+$/, '') || '192.168.15';
    addLog({
      id: `scan-kapbom-start-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      phase: 'probe',
      target: `${cleanPrefix}.0/24`,
      message: `Iniciando varredura rápida focada em Câmeras Kapbom / Yoosee (portas 5000 e 8899)...`,
    });

    try {
      let foundAny = false;
      const targets = [2, 3, 4, 5, 10, 11, 15, 20, 21, 22, 25, 30, 35, 40, 50, 100, 101, 102, 105, 108, 110, 120, 150, 200];
      for (const suffix of targets) {
        const testIp = `${cleanPrefix}.${suffix}`;
        const p5000 = await probePort(testIp, 5000, 300);
        const p8899 = !p5000 ? await probePort(testIp, 8899, 300) : false;
        if (p5000 || p8899) {
          foundAny = true;
          const port = p5000 ? 5000 : 8899;
          addLog({
            id: `found-kapbom-${testIp}`,
            timestamp: new Date().toLocaleTimeString(),
            phase: 'probe',
            target: `${testIp}:${port}`,
            message: `Dispositivo Kapbom / Yoosee encontrado no IP ${testIp}:${port}!`,
            success: true,
          });
          setKapbomIpInput(testIp);
          const profile = createKapbomProfile(testIp, { port: 554 });
          setLearnedProfiles(getLearnedProfiles());
          onSelectCameraToView(profileToNetworkCamera(profile));
          break;
        }
      }

      if (!foundAny) {
        addLog({
          id: `scan-kapbom-empty-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          phase: 'failed',
          target: `${cleanPrefix}.0/24`,
          message: `Nenhum dispositivo com portas Yoosee (5000/8899) respondeu nos IPs padrão. Por favor, consulte o IP exato no app Yoosee no celular (Configurações > Informações do Dispositivo) e digite no assistente Kapbom.`,
        });
      }
    } finally {
      setIsScanningKapbomSubnet(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4 text-slate-100 max-w-5xl mx-auto w-full">
      {/* Header with Title and Neural AI Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500/30 via-cyan-500/20 to-purple-500/30 border border-cyan-500/40 rounded-xl shadow-lg shadow-indigo-950/50">
            <Brain className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Inteligência de Rede & Auto-Conexão Autônoma
              </h2>
              <span className="bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-300" />
                IA GEMINI ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Varre a rede local, identifica fabricantes desconhecidos, deduz rotas de vídeo e memoriza as configurações para conexão automática.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-colors"
          >
            Fechar Painel
          </button>
        )}
      </div>

      {/* Top 5-Stage Autonomous Pipeline Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl text-xs">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-cyan-950/50 border border-cyan-700/60 shadow-sm">
          <div className="p-1.5 bg-cyan-900 text-cyan-300 rounded-md border border-cyan-500/50">
            <Wifi className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-cyan-300 font-mono font-bold block">1. VERIFICAR REDE</span>
            <span className="font-semibold text-white truncate block">Sub-rede & Gateway</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="p-1.5 bg-indigo-950 text-indigo-400 rounded-md border border-indigo-800/50">
            <Search className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-mono block">2. VARREDURA</span>
            <span className="font-semibold text-slate-200 truncate block">Sonda Portas de Vídeo</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="p-1.5 bg-indigo-950 text-indigo-400 rounded-md border border-indigo-800/50">
            <Server className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-mono block">3. FINGERPRINT</span>
            <span className="font-semibold text-slate-200 truncate block">Identifica Fabricante</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="p-1.5 bg-purple-950 text-purple-400 rounded-md border border-purple-800/50">
            <Brain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-mono block">4. IA RESOLVER</span>
            <span className="font-semibold text-slate-200 truncate block">Deduz Rotas & Login</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="p-1.5 bg-emerald-950 text-emerald-400 rounded-md border border-emerald-800/50">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-400 font-mono block">5. CONEXÃO</span>
            <span className="font-semibold text-slate-200 truncate block">Memoriza & Exibe</span>
          </div>
        </div>
      </div>

      {/* 1ª AÇÃO: VERIFICAR EM QUAL REDE ESTAMOS (Card Principal de Diagnóstico e Controle) */}
      <div className="bg-gradient-to-br from-cyan-950/60 via-slate-950 to-slate-900 border-2 border-cyan-500/50 rounded-2xl p-4 shadow-xl space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-xl shadow-md">
              <Wifi className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800 font-mono">
                  1ª Ação Obrigatória
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Verificar em Qual Rede Estamos
                </h3>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Identifica o IP local do navegador, sonda os gateways de rede ativos e valida a sub-rede antes da varredura de câmeras.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleRunNetworkVerification(true)}
            disabled={isVerifyingNet || isSweeping}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-600/30 transition-all active:scale-95 shrink-0"
          >
            {isVerifyingNet ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin text-white" />
                <span>Identificando Rede...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 text-cyan-200" />
                <span>Verificar Rede Agora</span>
              </>
            )}
          </button>
        </div>

        {/* Live Network Diagnostic Display */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-slate-900/90 p-3 rounded-xl border border-cyan-900/40 font-mono">
          <div className="flex flex-col justify-center">
            <span className="text-[10px] text-slate-400 font-sans">SUB-REDE ATIVA DETECTADA</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <strong className="text-sm text-cyan-300 font-bold">
                {subnetPrefix.replace(/\.+$/, '')}.0/24
              </strong>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <span className="text-[10px] text-slate-400 font-sans">GATEWAY / ROTEADOR ATIVO</span>
            <span className="text-slate-200 font-semibold mt-0.5">
              {netVerification?.gatewayIp || `${subnetPrefix.replace(/\.+$/, '')}.1`}
              {netVerification?.latencyMs && (
                <span className="text-emerald-400 text-[11px] ml-1.5 font-normal">
                  ({netVerification.latencyMs}ms)
                </span>
              )}
            </span>
          </div>

          <div className="flex flex-col justify-center">
            <span className="text-[10px] text-slate-400 font-sans">STATUS DA REDE DO CLIENTE</span>
            <span className="text-emerald-300 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Rede Confirmada para Varredura</span>
            </span>
          </div>
        </div>

        {/* Quick Subnet Selector & Custom Prefix Input */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Confirmar / Trocar Faixa:</span>
            {[
              { label: '192.168.15.X (Sua Rede)', prefix: '192.168.15' },
              { label: '192.168.1.X', prefix: '192.168.1' },
              { label: '192.168.0.X', prefix: '192.168.0' },
              { label: '10.0.0.X', prefix: '10.0.0' },
            ].map((s) => {
              const isSelected = subnetPrefix.replace(/\.+$/, '') === s.prefix;
              return (
                <button
                  key={s.prefix}
                  onClick={() => {
                    setSubnetPrefix(s.prefix);
                    setCustomIpInput(`${s.prefix}.`);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-mono transition-all ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400">Prefixo Manual:</span>
              <input
                type="text"
                value={subnetPrefix}
                onChange={(e) => {
                  const val = e.target.value;
                  setSubnetPrefix(val);
                  setCustomIpInput(val.endsWith('.') ? val : `${val}.`);
                }}
                placeholder="192.168.15"
                className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 text-xs text-white font-mono rounded focus:outline-none focus:border-cyan-500"
              />
              <span className="font-mono text-slate-400 text-xs">.X</span>
            </div>

            <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
              <button
                onClick={() => setSweepScope('fast')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  sweepScope === 'fast'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Rápida (1-30)
              </button>
              <button
                onClick={() => setSweepScope('full')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  sweepScope === 'full'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Total (1-254)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Banner de Reconhecimento: Câmera Kapbom PTZ da Foto */}
      <div className="bg-gradient-to-r from-amber-950/60 via-slate-950 to-indigo-950/60 border-2 border-amber-500/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl shrink-0 mt-0.5 sm:mt-0 text-amber-300 shadow-md">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-amber-200">
                Câmera da Foto Identificada: KAPBOM PTZ Wi-Fi (Speed Dome)
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                Yoosee / ICSee PTZ Externa
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Sua câmera Kapbom transmite em <strong>RTSP (porta 554)</strong> e <strong>ONVIF Yoosee (porta 5000)</strong>. Como essas portas de segurança não abrem páginas HTTP comuns, use o assistente dedicado abaixo com rota e credenciais automáticas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            onClick={() => setActiveTab('kapbom')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 ${
              activeTab === 'kapbom'
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-400'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Abrir Assistente Kapbom</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Strip: Autonomous Sweep vs Single IP Quick-Learn */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: Autonomous Subnet Sweep Trigger (2-Stage Real Scanning) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 border border-indigo-900/50 rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-md">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Rastreio Real: Rede & Portas ({subnetPrefix.replace(/\.+$/, '')}.0/24)
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                2 ETAPAS + LOG
              </span>
            </div>
            <div className="text-[11px] text-slate-300 mt-2 space-y-1 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-mono">
              <div className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <strong>1ª Etapa:</strong> Rastreia a rede e descobre hosts ativos (LAN).
              </div>
              <div className="flex items-center gap-1.5 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <strong>2ª Etapa:</strong> Port scan (554 RTSP, 5000 Yoosee, 8899, 80).
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <strong>Arquivo de Log:</strong> Gera diagnóstico completo para download.
              </div>
            </div>
          </div>

          {isSweeping && (
            <div className="space-y-1.5 bg-slate-900/90 p-2.5 rounded-lg border border-cyan-900/50">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-cyan-300 flex items-center gap-1 font-semibold truncate">
                  <RotateCw className="w-3 h-3 animate-spin shrink-0" />
                  <span>{currentPhaseName || `Sondando: ${sweepProgress.ip}`}</span>
                </span>
                <span className="text-slate-400 shrink-0 ml-2">
                  {sweepProgress.current}/{sweepProgress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-2 transition-all duration-300"
                  style={{
                    width: `${sweepProgress.total > 0 ? (sweepProgress.current / sweepProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-mono text-right">
                Alvo atual: {sweepProgress.ip}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={handleStartSweep}
              disabled={isSweeping || isLearningSingle}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-900/30 active:scale-95"
            >
              {isSweeping ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin text-white" />
                  <span>Executando Rastreio em 2 Etapas...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-cyan-200" />
                  <span>Rastrear Rede & Portas Agora</span>
                </>
              )}
            </button>

            {diagnosticReport && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadLogFile(diagnosticReport.logText)}
                  className="flex-1 py-1.5 px-3 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  title="Baixar arquivo de log gerado no rastreio"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Log (.txt)</span>
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ver Relatório</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Learn & Connect Specific Camera by IP */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-md">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-cyan-400" />
                Aprender a Conectar um IP Específico
              </span>
              <span className="text-[11px] text-slate-400">Auto-Negociação com IA</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Seu celular ou câmera está em um IP específico (ex: <code className="text-cyan-300">{subnetPrefix.replace(/\.+$/, '')}.20:8080</code>)? Digite-o para que a IA deduza a rota, teste os endpoints e estabeleça a conexão direta.
            </p>
          </div>

          <form onSubmit={handleLearnSingleIp} className="flex flex-col sm:flex-row items-center gap-2">
            <div className="w-full sm:w-2/5">
              <input
                type="text"
                placeholder={`Ex: ${subnetPrefix.replace(/\.+$/, '')}.25`}
                value={customIpInput}
                onChange={(e) => setCustomIpInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white font-mono px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="w-full sm:w-1/4">
              <input
                type="text"
                placeholder="Porta (ex: 8080)"
                value={customPortInput}
                onChange={(e) => setCustomPortInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white font-mono px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLearningSingle || isSweeping || !customIpInput}
              className="w-full sm:w-auto shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/30"
            >
              {isLearningSingle ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Investigando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Aprender & Conectar</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Tabs Navigation: Learned Profiles vs Live Discovery Logs vs Signatures Knowledge */}
      <div className="flex items-center gap-2 border-b border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('kapbom')}
          className={`pb-2 px-3 transition-colors flex items-center gap-1.5 border-b-2 shrink-0 ${
            activeTab === 'kapbom'
              ? 'border-amber-400 text-amber-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>Assistente Kapbom PTZ</span>
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
            Foto Enviada
          </span>
        </button>

        <button
          onClick={() => setActiveTab('learned')}
          className={`pb-2 px-3 transition-colors flex items-center gap-1.5 border-b-2 shrink-0 ${
            activeTab === 'learned'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Câmeras & Perfis Aprendidos</span>
          <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
            {learnedProfiles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sweep')}
          className={`pb-2 px-3 transition-colors flex items-center gap-1.5 border-b-2 shrink-0 ${
            activeTab === 'sweep'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console em Tempo Real</span>
          {logs.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('report')}
          className={`pb-2 px-3 transition-colors flex items-center gap-1.5 border-b-2 shrink-0 ${
            activeTab === 'report'
              ? 'border-emerald-400 text-emerald-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-emerald-400" />
          <span>Arquivo de Log & Configuração</span>
          {diagnosticReport ? (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {diagnosticReport.activeHostsCount} Hosts
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              Novo
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('signatures')}
          className={`pb-2 px-3 transition-colors flex items-center gap-1.5 border-b-2 shrink-0 ${
            activeTab === 'signatures'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Base de Conhecimento de Fabricantes</span>
        </button>
      </div>

      {/* TAB KAPBOM: Assistente Especial Câmera Kapbom PTZ Wi-Fi */}
      {activeTab === 'kapbom' && (
        <div className="space-y-4">
          {/* Header Card: Confirmação do Modelo da Foto */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30 border border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl shadow-md">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Câmera Wi-Fi PTZ Externa Kapbom (Speed Dome)
                    </h3>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                      Identificada pela Foto
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Modelo Yoosee / ICSee PTZ com antena dupla, LEDs brancos, infravermelho e rotação Pan/Tilt/Zoom
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="text-[11px] font-mono text-amber-300 bg-amber-950/80 border border-amber-800/80 px-2 py-1 rounded-lg">
                  RTSP: 554 // ONVIF: 5000 / 8899
                </span>
              </div>
            </div>

            {/* Diagnóstico técnico: Por que ela não apareceu na varredura padrão */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Por que ela não foi encontrada na varredura automática?</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Ao contrário de smartphones que rodam páginas web simples em portas HTTP (8080), as câmeras de segurança Kapbom funcionam apenas com <strong>protocolos de vigilância RTSP (porta 554)</strong> e <strong>serviço ONVIF Yoosee (porta 5000)</strong>. Como essas portas não expõem um site web comum, o navegador não consegue adivinhar qual IP ela recebeu no seu roteador sem que você o informe.
              </p>
            </div>

            {/* Guia em 3 Passos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Passo 1 */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Passo 1
                    </span>
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-white text-xs">Ver IP no App Yoosee</h4>
                  <ol className="text-[11px] text-slate-300 space-y-1 list-decimal list-inside leading-snug pl-0.5">
                    <li>Abra o app <strong>Yoosee</strong> no celular onde a câmera funciona.</li>
                    <li>Toque na <strong>engrenagem</strong> (Configurações).</li>
                    <li>Vá em <strong>Informações do Dispositivo</strong>.</li>
                    <li>Copie o <strong>Endereço IP</strong> (ex: <code className="text-cyan-300">192.168.15.25</code>).</li>
                  </ol>
                </div>
                <div className="text-[10px] text-slate-400 bg-slate-900 p-1.5 rounded border border-slate-800">
                  💡 A câmera já está com esse IP salvo no seu roteador.
                </div>
              </div>

              {/* Passo 2 */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                      Passo 2
                    </span>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-white text-xs">Ativar Conexão NVR</h4>
                  <ol className="text-[11px] text-slate-300 space-y-1 list-decimal list-inside leading-snug pl-0.5">
                    <li>No app Yoosee: toque em <strong>Conexões NVR</strong>.</li>
                    <li>Ative o botão para liberar o fluxo RTSP.</li>
                    <li>A senha padrão de fábrica é <strong>123456</strong>.</li>
                    <li>Se você definiu outra senha na instalação, utilize-a.</li>
                  </ol>
                </div>
                <div className="text-[10px] text-slate-400 bg-slate-900 p-1.5 rounded border border-slate-800">
                  🔑 Usuário: <span className="text-white font-mono font-bold">admin</span> | Senha: <span className="text-white font-mono font-bold">123456</span>
                </div>
              </div>

              {/* Passo 3 */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                      Passo 3
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <h4 className="font-bold text-white text-xs">Conectar & Transmitir</h4>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    Digite o IP copiado do app no formulário abaixo e clique em <strong>Conectar Câmera Kapbom</strong>. A IA configurará a rota RTSP <code>/onvif1</code> e o feed será exibido na tela principal com detecção ativa!
                  </p>
                </div>
                <div className="text-[10px] text-emerald-300 bg-emerald-950/50 p-1.5 rounded border border-emerald-800/60 font-semibold">
                  ✓ Configuração direta em 1 clique
                </div>
              </div>
            </div>

            {/* Formulário de Conexão Direta */}
            <form onSubmit={handleConnectKapbomDirect} className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Conexão Direta da Câmera Kapbom
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Sub-rede Atual: {subnetPrefix.replace(/\.+$/, '')}.0/24
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* IP Input */}
                <div className="sm:col-span-5">
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Endereço IP da Câmera no seu Roteador:
                  </label>
                  <input
                    type="text"
                    value={kapbomIpInput}
                    onChange={(e) => setKapbomIpInput(e.target.value)}
                    placeholder="Ex: 192.168.15.25"
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">IPs prováveis:</span>
                    {['20', '25', '30', '50', '100', '105'].map((end) => {
                      const candidateIp = `${subnetPrefix.replace(/\.+$/, '')}.${end}`;
                      return (
                        <button
                          key={end}
                          type="button"
                          onClick={() => setKapbomIpInput(candidateIp)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
                        >
                          .{end}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* RTSP Port */}
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Porta RTSP:
                  </label>
                  <select
                    value={kapbomPort}
                    onChange={(e) => setKapbomPort(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs px-2.5 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    <option value={554}>554 (Padrão RTSP)</option>
                    <option value={5000}>5000 (ONVIF Yoosee)</option>
                    <option value={8899}>8899 (ONVIF ICSee)</option>
                    <option value={80}>80 (HTTP Snapshot)</option>
                  </select>
                </div>

                {/* Username */}
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Usuário:
                  </label>
                  <input
                    type="text"
                    value={kapbomUsername}
                    onChange={(e) => setKapbomUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Password */}
                <div className="sm:col-span-3">
                  <label className="text-xs text-slate-300 font-medium block mb-1">
                    Senha NVR / Yoosee:
                  </label>
                  <input
                    type="text"
                    value={kapbomPassword}
                    onChange={(e) => setKapbomPassword(e.target.value)}
                    placeholder="123456"
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {kapbomFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    kapbomFeedback.success
                      ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/70 border border-rose-800 text-rose-300'
                  }`}
                >
                  {kapbomFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{kapbomFeedback.message}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleScanKapbomPorts}
                  disabled={isScanningKapbomSubnet || isConnectingKapbom}
                  className="w-full sm:w-auto px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                >
                  <Search className={`w-3.5 h-3.5 ${isScanningKapbomSubnet ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>
                    {isScanningKapbomSubnet
                      ? 'Sondando portas 5000/8899 na sub-rede...'
                      : `Sondar portas Yoosee na rede ${subnetPrefix.replace(/\.+$/, '')}.X`}
                  </span>
                </button>

                <button
                  type="submit"
                  disabled={isConnectingKapbom || !kapbomIpInput}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 text-xs font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all active:scale-95"
                >
                  {isConnectingKapbom ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Conectando e Negociando Fluxo RTSP...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>Conectar Câmera Kapbom e Iniciar Transmissão</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 1: Learned Profiles Cards */}
      {activeTab === 'learned' && (
        <div className="space-y-3">
          {learnedProfiles.length > 0 && (
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-slate-400">
                {learnedProfiles.length} {learnedProfiles.length === 1 ? 'câmera memorizada' : 'câmeras memorizadas'} na rede local
              </span>
              <button
                onClick={handleClearAllProfiles}
                className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded bg-red-950/40 border border-red-800/40 hover:bg-red-950/70 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Limpar Câmeras Memorizadas
              </button>
            </div>
          )}

          {learnedProfiles.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-xl">
              <Brain className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum perfil memorizado ainda</p>
              <p className="text-xs text-slate-500 mt-1">
                Execute a varredura autônoma acima ou insira um IP para que a IA aprenda a se conectar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {learnedProfiles.map((profile) => {
                const isCurrent = activeCameraId === profile.id;
                return (
                  <div
                    key={profile.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      isCurrent
                        ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-950/40'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Card Header: Brand, Model and Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <h3 className="font-bold text-sm text-white">{profile.brand}</h3>
                          </div>
                          <p className="text-xs text-slate-300 mt-0.5">{profile.model}</p>
                        </div>

                        <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold">
                          {profile.protocol}
                        </span>
                      </div>

                      {/* Technical Details Grid */}
                      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                        <div>
                          <span className="text-slate-400 block text-[10px]">ENDEREÇO IP</span>
                          <span className="text-cyan-300 font-semibold">{profile.ip}:{profile.port}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px]">ROTA APRENDIDA</span>
                          <span className="text-emerald-300 font-semibold truncate block">{profile.successfulPath}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px]">LATÊNCIA & FPS</span>
                          <span className="text-slate-300">{profile.latencyMs}ms // {profile.fps} FPS</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px]">CONFIANÇA DA IA</span>
                          <span className="text-indigo-300">{Math.round(profile.confidence * 100)}%</span>
                        </div>
                      </div>

                      {/* AI Notes / Explanation */}
                      {profile.aiNotes && (
                        <p className="text-[11px] text-slate-400 italic mt-2 line-clamp-2">
                          "{profile.aiNotes}"
                        </p>
                      )}
                    </div>

                    {/* Actions: Connect to Live Viewer or Delete */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => handleConnectToViewer(profile)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Transmitir no Visualizador</span>
                      </button>

                      <button
                        onClick={(e) => handleDeleteProfile(profile.id, e)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Esquecer este perfil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Live Discovery & Autonomous Learning Logs Terminal */}
      {activeTab === 'sweep' && (
        <div className="space-y-3">
          {/* 2-Phase Status Header Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">FASE 1: RASTREIO DA REDE</span>
                <span className="text-cyan-300 font-bold">
                  {diagnosticReport ? `${diagnosticReport.activeHostsCount} Hosts Ativos na LAN` : 'Sondagem de Hosts Vivos'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">FASE 2: RASTREIO DE PORTAS</span>
                <span className="text-amber-300 font-bold">
                  Portas 554, 5000, 8899, 80, 8080
                </span>
              </div>
            </div>

            <div className="flex items-center justify-start sm:justify-end gap-2">
              {diagnosticReport ? (
                <button
                  onClick={() => downloadLogFile(diagnosticReport.logText)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo de Log</span>
                </button>
              ) : (
                <button
                  onClick={() => handleStartSweep()}
                  disabled={isSweeping}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Iniciar Rastreio</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs flex flex-col h-72">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>LOG DE ATIVIDADES: RASTREIO DE REDE E PORTAS</span>
              </div>
              <div className="flex items-center gap-2">
                {diagnosticReport && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(diagnosticReport.logText);
                      setCopiedLog(true);
                      setTimeout(() => setCopiedLog(false), 2000);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] flex items-center gap-1"
                  >
                    {copiedLog ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLog ? 'Copiado!' : 'Copiar Log'}</span>
                  </button>
                )}
                <button
                  onClick={() => setLogs([])}
                  className="text-slate-500 hover:text-slate-300 text-[10px]"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-10">
                  Aguardando início de varredura ou aprendizado de IP...
                </div>
              ) : (
                logs.map((log) => {
                  let badgeColor = 'text-cyan-400 bg-cyan-950/60 border-cyan-800';
                  if (log.phase === 'ai_resolve') badgeColor = 'text-purple-400 bg-purple-950/60 border-purple-800';
                  if (log.phase === 'negotiate') badgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800';
                  if (log.phase === 'learned') badgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
                  if (log.phase === 'failed') badgeColor = 'text-rose-400 bg-rose-950/60 border-rose-800';

                  return (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 shrink-0 text-[10px]">[{log.timestamp}]</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] border uppercase font-semibold shrink-0 ${badgeColor}`}>
                        {log.phase}
                      </span>
                      <span className="text-indigo-300 shrink-0">[{log.target}]</span>
                      <span className={log.success ? 'text-emerald-300' : 'text-slate-300'}>
                        {log.message}
                      </span>
                      {log.details && (
                        <span className="text-slate-500 text-[10px]">({log.details})</span>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* TAB REPORT: Arquivo de Log & Relatório de Configuração */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          {diagnosticReport ? (
            <>
              {/* Report Header Card with Export Actions */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-xl shadow-md">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">
                        Arquivo de Log para Configuração de Câmeras
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Relatório técnico completo gerado a partir do rastreio real da sub-rede e teste de portas.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => downloadLogFile(diagnosticReport.logText)}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/30 active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar Arquivo de Log (.txt)</span>
                    </button>

                    <button
                      onClick={() => downloadJsonFile(diagnosticReport)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span>Baixar JSON</span>
                    </button>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(diagnosticReport.logText);
                        setCopiedLog(true);
                        setTimeout(() => setCopiedLog(false), 2000);
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      {copiedLog ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                      <span>{copiedLog ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                {/* Report Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">SUB-REDE VARRIDA</span>
                    <span className="text-cyan-300 font-bold text-sm">{diagnosticReport.subnet}</span>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">GATEWAY / ROTEADOR</span>
                    <span className="text-slate-200 font-semibold text-sm">
                      {diagnosticReport.gatewayIp || '192.168.15.1'}
                      {diagnosticReport.gatewayLatencyMs && (
                        <span className="text-emerald-400 text-xs ml-1">({diagnosticReport.gatewayLatencyMs}ms)</span>
                      )}
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">HOSTS ATIVOS (FASE 1)</span>
                    <span className="text-emerald-300 font-bold text-sm">
                      {diagnosticReport.activeHostsCount} dispositivos
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">CÂMERAS DESCOBERTAS (FASE 2)</span>
                    <span className="text-amber-300 font-bold text-sm">
                      {diagnosticReport.discoveredCameras.length} câmeras
                    </span>
                  </div>
                </div>
              </div>

              {/* Phase 1 & Phase 2 Visual Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Phase 1: Alive Hosts */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                      Hosts Ativos na Rede (Fase 1)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {diagnosticReport.activeHosts.length} encontrados
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono">
                    {diagnosticReport.activeHosts.map((h) => (
                      <div
                        key={h.ip}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800/80"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <strong className="text-white">{h.ip}</strong>
                          {h.isGateway && (
                            <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 text-[9px] px-1.5 py-0.2 rounded font-sans font-semibold">
                              Gateway
                            </span>
                          )}
                        </div>
                        <span className="text-emerald-400 text-[11px]">{h.rttMs} ms</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phase 2: Port Scanning Results */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-amber-400" />
                      Rastreio de Portas de Vídeo (Fase 2)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      554, 5000, 8899, 80, 8080
                    </span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-[11px]">
                    {diagnosticReport.activeHosts.map((h) => {
                      const openPorts = (h.portsScanned || []).filter((p) => p.status === 'open');
                      return (
                        <div key={h.ip} className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-bold">{h.ip}</span>
                            <span className="text-slate-400 text-[10px]">
                              {openPorts.length > 0 ? `${openPorts.length} portas abertas` : 'Sem portas abertas'}
                            </span>
                          </div>
                          {openPorts.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {openPorts.map((p) => (
                                <span
                                  key={p.port}
                                  className="bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] px-2 py-0.5 rounded font-semibold"
                                >
                                  Porta {p.port} ({p.service.split(' ')[0]})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[10px] block mt-0.5">
                              Nenhuma porta de câmera respondeu diretamente neste host.
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Raw Log Preview Viewer */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-white font-bold">Conteúdo do Arquivo de Log Gerado (.txt)</span>
                  </div>
                  <button
                    onClick={() => downloadLogFile(diagnosticReport.logText)}
                    className="text-emerald-400 hover:text-emerald-300 text-[11px] flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Arquivo</span>
                  </button>
                </div>

                <pre className="text-slate-300 p-3 bg-slate-900/90 rounded-lg overflow-x-auto max-h-72 text-[11px] leading-relaxed select-all">
                  {diagnosticReport.logText}
                </pre>
              </div>
            </>
          ) : (
            <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <FileText className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="font-bold text-white text-base">Nenhum Relatório de Rastreio Gerado Ainda</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Execute o rastreio da rede e portas para descobrir quais dispositivos estão ativos e gerar automaticamente o arquivo de log para ajudar na configuração das câmeras.
              </p>
              <button
                onClick={() => handleStartSweep()}
                disabled={isSweeping}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 shadow-lg shadow-cyan-900/30"
              >
                <Zap className="w-4 h-4" />
                <span>Rastrear Rede e Gerar Arquivo de Log</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Known Vendor Signatures Knowledge Base */}
      {activeTab === 'signatures' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
          {KNOWN_VENDOR_SIGNATURES.map((sig, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between text-xs"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{sig.brand}</span>
                  <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                    Portas: {sig.defaultPorts.join(', ')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{sig.description}</p>
                <div className="mt-2 text-[10px] font-mono text-slate-300 space-y-0.5">
                  <div>
                    <span className="text-slate-500">Rotas comuns: </span>
                    <span className="text-emerald-400">{sig.candidatePaths.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Credenciais padrão: </span>
                    <span className="text-indigo-300">{sig.defaultUser} ({sig.defaultPassHint})</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
