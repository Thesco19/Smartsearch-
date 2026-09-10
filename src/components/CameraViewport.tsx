import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Camera,
  Video,
  Upload,
  RefreshCw,
  Play,
  Pause,
  Maximize2,
  Scan,
  AlertCircle,
  Eye,
  Sliders,
  Check,
  Wifi,
  Radio,
  Server,
  Zap,
  Smartphone,
  Globe,
  ShieldAlert,
  ChevronDown,
  Shield,
  Layers,
  Brain,
  Sparkles,
} from 'lucide-react';
import { SmartCamDetection, SmartCamAnalysisResponse, NetworkCamera } from '../types';
import { sampleFeeds, SampleFeed } from '../data/sampleFeeds';
import { defaultNetworkCameras } from '../data/networkCameras';
import { renderLanCameraFrame, renderSampleLiveCCTVOverlay } from '../utils/lanCameraRenderer';
import { NetworkCameraScanner } from './NetworkCameraScanner';
import { getLearnedProfiles, profileToNetworkCamera } from '../utils/cameraLearningEngine';
import { CameraIntelligencePanel } from './CameraIntelligencePanel';

interface CameraViewportProps {
  onAnalyzeFrame: (base64Image: string, timestamp: string, sourceName: string) => Promise<void>;
  isAnalyzing: boolean;
  currentAnalysis: SmartCamAnalysisResponse | null;
  isAutoDetecting: boolean;
  onToggleAutoDetect: (active: boolean) => void;
  autoIntervalSeconds: number;
  onChangeAutoInterval: (sec: number) => void;
  selectedDetectionIndex: number | null;
  onSelectDetection: (index: number | null) => void;
  onOpenScanner?: () => void;
  externalScannerTrigger?: boolean;
  externalSelectedCamera?: NetworkCamera | null;
  onOpenIntelligencePanel?: () => void;
}

type FeedMode = 'webcam' | 'lan' | 'sample' | 'upload';

export const CameraViewport: React.FC<CameraViewportProps> = ({
  onAnalyzeFrame,
  isAnalyzing,
  currentAnalysis,
  isAutoDetecting,
  onToggleAutoDetect,
  autoIntervalSeconds,
  onChangeAutoInterval,
  selectedDetectionIndex,
  onSelectDetection,
  onOpenScanner,
  externalScannerTrigger,
  externalSelectedCamera,
  onOpenIntelligencePanel,
}) => {
  // Default directly to 'webcam' so the user can easily see their PC camera
  const [feedMode, setFeedMode] = useState<FeedMode>('webcam');
  const [discoveredCameras, setDiscoveredCameras] = useState<NetworkCamera[]>(() => {
    const learned = getLearnedProfiles().map(profileToNetworkCamera);
    return [...learned, ...defaultNetworkCameras];
  });
  const [activeLanCamera, setActiveLanCamera] = useState<NetworkCamera>(() => {
    const learned = getLearnedProfiles();
    if (learned.length > 0) return profileToNetworkCamera(learned[0]);
    return defaultNetworkCameras[0];
  });
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isIntelligenceModalOpen, setIsIntelligenceModalOpen] = useState<boolean>(false);

  // Available physical / virtual video devices on the user's PC
  const [availableVideoDevices, setAvailableVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');

  const [activeSample, setActiveSample] = useState<SampleFeed>(sampleFeeds[0]);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isRequestingWebcam, setIsRequestingWebcam] = useState<boolean>(false);

  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Real IP camera stream states
  const [realStreamError, setRealStreamError] = useState<string | null>(null);
  const [snapshotCounter, setSnapshotCounter] = useState<number>(0);
  const [isUsingProxy, setIsUsingProxy] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const realMjpegRef = useRef<HTMLImageElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lanTickRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Sync external scanner open trigger
  useEffect(() => {
    if (externalScannerTrigger) {
      setIsScannerOpen(true);
    }
  }, [externalScannerTrigger]);

  // Sync external camera chosen from Intelligence Panel
  useEffect(() => {
    if (externalSelectedCamera) {
      setActiveLanCamera(externalSelectedCamera);
      setFeedMode('lan');
      stopWebcam();
      setDiscoveredCameras((prev) => {
        const exists = prev.some((c) => c.id === externalSelectedCamera.id);
        if (exists) return prev;
        return [externalSelectedCamera, ...prev];
      });
    }
  }, [externalSelectedCamera]);

  // Enumerate video devices connected to the browser
  const refreshDevices = useCallback(async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devs.filter((d) => d.kind === 'videoinput');
        setAvailableVideoDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedVideoDeviceId) {
          const firstNonEmpty = videoInputs.find((d) => d.deviceId) || videoInputs[0];
          setSelectedVideoDeviceId(firstNonEmpty.deviceId);
        }
      } catch (e) {
        console.warn('Erro ao enumerar dispositivos de vídeo:', e);
      }
    }
  }, [selectedVideoDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Live CCTV timestamp string update
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeStr(
        `${now.toLocaleDateString()} ${now.toLocaleTimeString()} - FPS: 30`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Ensure video element receives stream whenever webcamStream is active
  useEffect(() => {
    if (feedMode === 'webcam' && videoRef.current && webcamStream) {
      if (videoRef.current.srcObject !== webcamStream) {
        videoRef.current.srcObject = webcamStream;
      }
      videoRef.current.play().catch((e) => {
        console.warn('Erro no play automático do vídeo:', e);
      });
    }
  }, [webcamStream, feedMode]);

  // Start Webcam with robust constraints and fallback
  const startWebcam = async (deviceId?: string) => {
    setWebcamError(null);
    setIsRequestingWebcam(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('A API getUserMedia não é suportada por este navegador ou contexto.');
      }

      // Stop previous stream if any
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }

      let stream: MediaStream | null = null;
      const targetDevId = deviceId || selectedVideoDeviceId;

      // Attempt 1: Specific device if selected
      if (targetDevId && targetDevId.trim() !== '') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { ideal: targetDevId } },
            audio: false,
          });
        } catch (devErr) {
          console.warn('Tentativa com deviceId específico falhou, tentando fallback genérico:', devErr);
        }
      }

      // Attempt 2: Standard video: true fallback
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setWebcamStream(stream);
      setFeedMode('webcam');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Refresh devices to get real labels (now that permission is granted)
      await refreshDevices();
    } catch (err: any) {
      console.error('Falha ao inicializar câmera do PC:', err);
      let msg = 'Não foi possível acessar a câmera do computador.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão negada pelo navegador. Clique no ícone de câmera/cadeado na barra de endereços (ao lado do link do site) e selecione "Permitir".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera foi encontrada conectada ao computador.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'A câmera pode estar em uso por outro programa (Zoom, Meet, OBS, etc.) ou bloqueada pelo Windows/macOS.';
      }
      setWebcamError(msg);
    } finally {
      setIsRequestingWebcam(false);
    }
  };

  const stopWebcam = useCallback(() => {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
      setWebcamStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [webcamStream]);

  // Continuous 30 FPS CCTV Animation Render Loop for simulated LAN & Sample feeds
  useEffect(() => {
    if (feedMode !== 'lan' && feedMode !== 'sample') {
      return;
    }

    if (feedMode === 'lan' && activeLanCamera.isRealStream) {
      return;
    }

    let lastTime = performance.now();

    const loop = (time: number) => {
      if (time - lastTime >= 33) {
        lastTime = time;
        lanTickRef.current += 1;

        if (sampleCanvasRef.current) {
          const canvas = sampleCanvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (canvas.width !== 960 || canvas.height !== 540) {
              canvas.width = 960;
              canvas.height = 540;
            }

            if (feedMode === 'lan' && !activeLanCamera.isRealStream) {
              renderLanCameraFrame(ctx, 960, 540, activeLanCamera, lanTickRef.current);
            } else if (feedMode === 'sample') {
              activeSample.renderToCanvas(ctx, 960, 540);
              renderSampleLiveCCTVOverlay(ctx, 960, 540, activeSample, lanTickRef.current);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [feedMode, activeLanCamera, activeSample]);

  // Polling loop for HTTP snapshot cameras
  useEffect(() => {
    if (
      feedMode === 'lan' &&
      activeLanCamera.isRealStream &&
      activeLanCamera.streamType === 'snapshot'
    ) {
      const timer = setInterval(() => {
        setSnapshotCounter((c) => c + 1);
      }, 1200);
      return () => clearInterval(timer);
    }
  }, [feedMode, activeLanCamera]);

  // Unfreeze helper to restart the render loop on demand
  const handleUnfreezeFeed = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    lanTickRef.current = 0;

    let lastTime = performance.now();
    const restartLoop = (time: number) => {
      if (time - lastTime >= 33) {
        lastTime = time;
        lanTickRef.current += 1;

        if (sampleCanvasRef.current) {
          const canvas = sampleCanvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (feedMode === 'lan' && !activeLanCamera.isRealStream) {
              renderLanCameraFrame(ctx, 960, 540, activeLanCamera, lanTickRef.current);
            } else if (feedMode === 'sample') {
              activeSample.renderToCanvas(ctx, 960, 540);
              renderSampleLiveCCTVOverlay(ctx, 960, 540, activeSample, lanTickRef.current);
            }
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(restartLoop);
    };

    animFrameRef.current = requestAnimationFrame(restartLoop);
  }, [feedMode, activeLanCamera, activeSample]);

  // Switch Feed Mode
  const handleModeChange = (mode: FeedMode) => {
    if (mode !== 'webcam') {
      stopWebcam();
    }
    setFeedMode(mode);
    if (mode === 'webcam') {
      startWebcam(selectedVideoDeviceId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, [stopWebcam]);

  // Grab Frame as Base64 JPEG
  const grabCurrentFrameBase64 = useCallback((): string | null => {
    const hiddenCanvas = captureCanvasRef.current || document.createElement('canvas');
    const ctx = hiddenCanvas.getContext('2d');
    if (!ctx) return null;

    // 1. Direct Web Video stream (Webcam or browser device)
    if (feedMode === 'webcam' && videoRef.current && videoRef.current.videoWidth > 0) {
      hiddenCanvas.width = videoRef.current.videoWidth;
      hiddenCanvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      return hiddenCanvas.toDataURL('image/jpeg', 0.85);
    }

    // 2. Real MJPEG Image stream
    if (
      feedMode === 'lan' &&
      activeLanCamera.isRealStream &&
      (activeLanCamera.streamType === 'mjpeg' || activeLanCamera.streamType === 'snapshot') &&
      realMjpegRef.current &&
      realMjpegRef.current.naturalWidth > 0
    ) {
      try {
        hiddenCanvas.width = realMjpegRef.current.naturalWidth;
        hiddenCanvas.height = realMjpegRef.current.naturalHeight;
        ctx.drawImage(realMjpegRef.current, 0, 0);
        return hiddenCanvas.toDataURL('image/jpeg', 0.85);
      } catch (err) {
        console.warn('CORS restringiu captura direta do elemento img:', err);
      }
    }

    // 3. Canvas-rendered feed (LAN simulation or Sample scenario)
    if ((feedMode === 'lan' || feedMode === 'sample') && sampleCanvasRef.current) {
      return sampleCanvasRef.current.toDataURL('image/jpeg', 0.85);
    }

    // 4. Uploaded static image
    if (feedMode === 'upload' && uploadedImageSrc) {
      return uploadedImageSrc;
    }

    return null;
  }, [feedMode, activeLanCamera, uploadedImageSrc]);

  // Capture and Trigger Analysis
  const captureAndAnalyze = useCallback(async () => {
    if (isAnalyzing) return;
    const base64 = grabCurrentFrameBase64();
    if (!base64) return;

    let sourceName = 'Câmera do Computador (Webcam)';
    if (feedMode === 'lan') {
      sourceName = `${activeLanCamera.name} [${activeLanCamera.ip}]`;
    } else if (feedMode === 'sample') {
      sourceName = `${activeSample.cameraName} (${activeSample.name})`;
    } else if (feedMode === 'upload') {
      sourceName = `Arquivo: ${uploadedFileName || 'Imagem'}`;
    }

    await onAnalyzeFrame(base64, currentTimeStr, sourceName);
  }, [isAnalyzing, grabCurrentFrameBase64, feedMode, activeLanCamera, activeSample, uploadedFileName, currentTimeStr, onAnalyzeFrame]);

  // Auto-Detect Interval Loop
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (isAutoDetecting) {
      intervalId = setInterval(() => {
        captureAndAnalyze();
      }, autoIntervalSeconds * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAutoDetecting, autoIntervalSeconds, captureAndAnalyze]);

  // Handle Static Image Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setUploadedImageSrc(result);
      setFeedMode('upload');
      stopWebcam();
    };
    reader.readAsDataURL(file);
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Switch camera when user selects from scanner
  const handleSelectNetworkCamera = (camera: NetworkCamera) => {
    // If it's a physical or virtual browser device, activate webcam mode directly!
    if (camera.streamType === 'browser_device') {
      setFeedMode('webcam');
      if (camera.deviceId) {
        setSelectedVideoDeviceId(camera.deviceId);
        startWebcam(camera.deviceId);
      } else {
        startWebcam();
      }
      return;
    }

    setActiveLanCamera(camera);
    setFeedMode('lan');
    stopWebcam();

    // Add to discoveredCameras if not present
    setDiscoveredCameras((prev) => {
      const exists = prev.some((c) => c.id === camera.id);
      if (exists) return prev;
      return [camera, ...prev];
    });
  };

  // Helper for bounding box colors
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'person':
        return { border: 'border-cyan-400', bg: 'bg-cyan-500/20', pill: 'bg-cyan-500' };
      case 'vehicle':
        return { border: 'border-amber-400', bg: 'bg-amber-500/20', pill: 'bg-amber-500' };
      case 'threat':
        return { border: 'border-rose-500', bg: 'bg-rose-500/30', pill: 'bg-rose-600' };
      case 'pet':
        return { border: 'border-emerald-400', bg: 'bg-emerald-500/20', pill: 'bg-emerald-500' };
      default:
        return { border: 'border-indigo-400', bg: 'bg-indigo-500/20', pill: 'bg-indigo-500' };
    }
  };

  // Compute stream URL for real camera (direct or via server proxy)
  const currentStreamSrc = activeLanCamera.isRealStream
    ? isUsingProxy
      ? `/api/proxy-camera-snapshot?url=${encodeURIComponent(activeLanCamera.streamUrl)}&_t=${snapshotCounter}`
      : activeLanCamera.streamType === 'snapshot'
      ? `${activeLanCamera.streamUrl}${activeLanCamera.streamUrl.includes('?') ? '&' : '?'}_t=${snapshotCounter}`
      : activeLanCamera.streamUrl
    : '';

  return (
    <div className="flex flex-col gap-3">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl shadow-md">
        {/* Source Mode Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* PRIMARY: PC WEBCAM BUTTON */}
          <button
            id="feed-mode-webcam"
            onClick={() => handleModeChange('webcam')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
              feedMode === 'webcam'
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50 shadow-emerald-600/30'
                : 'bg-slate-800/90 text-emerald-400 border border-emerald-700/50 hover:bg-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-emerald-300" />
            <span>Câmera do PC (Webcam)</span>
            {webcamStream && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          {/* PC Video Device Switcher Dropdown (if multiple cameras detected) */}
          {feedMode === 'webcam' && availableVideoDevices.length > 1 && (
            <div className="relative flex items-center bg-slate-950 border border-emerald-600/60 rounded-lg px-2 py-1 text-xs">
              <select
                value={selectedVideoDeviceId}
                onChange={(e) => {
                  const newDevId = e.target.value;
                  setSelectedVideoDeviceId(newDevId);
                  startWebcam(newDevId);
                }}
                className="bg-transparent text-emerald-300 text-xs focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                {availableVideoDevices.map((dev, i) => (
                  <option key={dev.deviceId || i} value={dev.deviceId} className="bg-slate-900 text-white">
                    {dev.label || `Lente #${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LAN NETWORK CAMERAS BUTTON */}
          <button
            id="feed-mode-lan"
            onClick={() => handleModeChange('lan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              feedMode === 'lan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <span>Câmeras na Rede (LAN)</span>
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {discoveredCameras.length}
            </span>
          </button>

          {/* AI Intelligence & Auto-Connect Button */}
          <button
            id="open-intelligence-panel-btn"
            onClick={() => {
              if (onOpenIntelligencePanel) {
                onOpenIntelligencePanel();
              } else {
                setIsIntelligenceModalOpen(true);
              }
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-950 via-indigo-950 to-purple-950 hover:from-cyan-900 hover:to-indigo-900 border border-cyan-500/50 text-cyan-200 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Inteligência Autônoma: Varre a rede, busca configuração e aprende a se conectar"
          >
            <Brain className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
            <span>IA Auto-Conexão</span>
            <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
          </button>

          {/* Quick Scanner Modal Launcher */}
          <button
            id="open-scanner-modal-btn"
            onClick={() => {
              if (onOpenScanner) onOpenScanner();
              setIsScannerOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Buscar câmeras IP na rede ou conectar por URL"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scanner IP</span>
          </button>

          <button
            id="feed-mode-sample"
            onClick={() => handleModeChange('sample')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              feedMode === 'sample'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Cenários Gravados</span>
          </button>

          <button
            id="feed-mode-upload"
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              feedMode === 'upload'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Action Controls: Snapshot & Auto-Loop */}
        <div className="flex items-center gap-2">
          {/* Interval selector */}
          <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2 py-1 rounded-lg border border-slate-700/60">
            <Sliders className="w-3 h-3 text-slate-400" />
            <span>Loop:</span>
            <select
              value={autoIntervalSeconds}
              onChange={(e) => onChangeAutoInterval(Number(e.target.value))}
              className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
            >
              <option value={2} className="bg-slate-800 text-slate-200">2s</option>
              <option value={3} className="bg-slate-800 text-slate-200">3s</option>
              <option value={5} className="bg-slate-800 text-slate-200">5s</option>
              <option value={10} className="bg-slate-800 text-slate-200">10s</option>
            </select>
          </div>

          <button
            id="toggle-auto-detect"
            onClick={() => onToggleAutoDetect(!isAutoDetecting)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              isAutoDetecting
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isAutoDetecting ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isAutoDetecting ? 'Pausar IA' : 'Auto-Scan IA'}</span>
          </button>

          <button
            id="manual-capture-analyze"
            onClick={captureAndAnalyze}
            disabled={isAnalyzing}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/30 active:scale-95"
          >
            <Scan className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Analisando...' : 'Analisar Agora'}</span>
          </button>
        </div>
      </div>

      {/* LAN Sub-channels quick selector strip */}
      {feedMode === 'lan' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-mono text-[11px] px-1 shrink-0 flex items-center gap-1">
            <Server className="w-3 h-3 text-indigo-400" />
            Canais:
          </span>
          {discoveredCameras.map((cam) => {
            const isSelected = activeLanCamera.id === cam.id;
            return (
              <button
                key={cam.id}
                onClick={() => setActiveLanCamera(cam)}
                className={`px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? cam.isRealStream
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/70 font-semibold ring-1 ring-emerald-500/40'
                      : 'bg-indigo-950 text-indigo-200 border-indigo-500 font-semibold'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    cam.isRealStream ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'
                  }`}
                />
                <span>{cam.name}</span>
                {cam.isRealStream && (
                  <span className="text-[9px] bg-emerald-900 text-emerald-300 px-1 rounded font-mono">
                    REAL
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sample Scenario selector strip */}
      {feedMode === 'sample' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-mono text-[11px] px-1 shrink-0">Cenários:</span>
          {sampleFeeds.map((feed) => (
            <button
              key={feed.id}
              onClick={() => setActiveSample(feed)}
              className={`px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap transition-all ${
                activeSample.id === feed.id
                  ? 'bg-slate-800 text-indigo-300 border-indigo-500/50 font-medium'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {feed.name}
            </button>
          ))}
        </div>
      )}

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group select-none"
      >
        {/* Render Feed Media */}

        {/* 1. Video Element (Webcam mode) */}
        {feedMode === 'webcam' && (
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && webcamStream && el.srcObject !== webcamStream) {
                el.srcObject = webcamStream;
                el.play().catch(() => {});
              }
            }}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${!webcamStream ? 'hidden' : ''}`}
          />
        )}

        {/* 2. Real MJPEG or Snapshot Image */}
        {feedMode === 'lan' &&
          activeLanCamera.isRealStream &&
          (activeLanCamera.streamType === 'mjpeg' || activeLanCamera.streamType === 'snapshot') && (
            <img
              ref={realMjpegRef}
              src={currentStreamSrc}
              alt={activeLanCamera.name}
              crossOrigin="anonymous"
              onError={() => {
                setRealStreamError(
                  'O navegador não conseguiu carregar o fluxo da câmera. Isso pode ocorrer devido a bloqueio de Conteúdo Misto (HTTP em HTTPS) ou se o dispositivo estiver offline.'
                );
              }}
              onLoad={() => setRealStreamError(null)}
              className="w-full h-full object-contain bg-slate-950"
            />
          )}

        {/* 3. Canvas for simulated LAN channels and sample feeds */}
        {((feedMode === 'lan' && !activeLanCamera.isRealStream) || feedMode === 'sample') && (
          <canvas
            ref={sampleCanvasRef}
            className="w-full h-full object-cover"
          />
        )}

        {/* 4. Uploaded static image */}
        {feedMode === 'upload' && uploadedImageSrc && (
          <img
            src={uploadedImageSrc}
            alt="Feed carregado"
            className="w-full h-full object-contain bg-slate-950"
          />
        )}

        {/* Webcam Inactive Placeholder / Start prompt */}
        {feedMode === 'webcam' && !webcamStream && !webcamError && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300 z-10 max-w-md">
            <div className="p-4 bg-emerald-950/60 border border-emerald-500/30 rounded-2xl mb-3 shadow-lg shadow-emerald-950/50">
              <Camera className="w-10 h-10 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-base text-white">Câmera do Computador (Webcam)</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              {isRequestingWebcam
                ? 'Solicitando acesso à câmera... Por favor, clique em "Permitir" na caixa de diálogo do navegador.'
                : 'Clique no botão abaixo para ativar a transmissão ao vivo da câmera do seu PC ou webcam USB.'}
            </p>
            <button
              onClick={() => startWebcam(selectedVideoDeviceId)}
              disabled={isRequestingWebcam}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-xl shadow-emerald-600/30 active:scale-95"
            >
              <Play className="w-4 h-4" />
              <span>{isRequestingWebcam ? 'Aguardando Permissão...' : 'Ativar Câmera do PC Agora'}</span>
            </button>
          </div>
        )}

        {/* Error overlay for Webcam */}
        {feedMode === 'webcam' && webcamError && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-rose-300 z-20 max-w-lg mx-auto">
            <AlertCircle className="w-12 h-12 mb-2 text-rose-500" />
            <h3 className="font-semibold text-base text-white">Não foi possível ativar a câmera</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-sm">{webcamError}</p>

            <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-xl text-left text-[11px] text-slate-300 space-y-1 w-full max-w-sm">
              <span className="font-semibold text-emerald-400 block">Como liberar no navegador:</span>
              <p>1. Clique no ícone de <strong>cadeado ou câmera</strong> na barra de endereços do Chrome/Edge (ao lado do link).</p>
              <p>2. Alterne a opção <strong>"Câmera"</strong> para <strong>"Permitir"</strong>.</p>
              <p>3. Clique no botão abaixo para tentar novamente.</p>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => startWebcam(selectedVideoDeviceId)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all shadow-md shadow-emerald-600/30"
              >
                Tentar Ativar Novamente
              </button>

              <button
                onClick={() => handleModeChange('sample')}
                className="px-3.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 hover:bg-slate-700"
              >
                Ver Cenários Gravados
              </button>
            </div>
          </div>
        )}

        {/* Error overlay for Real IP Stream (Mixed Content / Network unreachable) */}
        {feedMode === 'lan' && activeLanCamera.isRealStream && realStreamError && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-slate-200 z-25 max-w-lg mx-auto">
            <ShieldAlert className="w-12 h-12 mb-2 text-amber-400" />
            <h3 className="font-semibold text-base text-white">
              Aviso de Conexão com Câmera Real
            </h3>
            <p className="text-xs text-slate-400 mt-1.5">{realStreamError}</p>
            <div className="text-[11px] font-mono text-cyan-300 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg mt-2 max-w-sm truncate">
              {activeLanCamera.streamUrl}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {!isUsingProxy && (
                <button
                  onClick={() => setIsUsingProxy(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-semibold transition-all shadow-md"
                >
                  Tentar via Proxy do Servidor
                </button>
              )}

              <button
                onClick={() => handleModeChange('webcam')}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition-all"
              >
                Usar Câmera do Computador
              </button>
            </div>
          </div>
        )}

        {/* Hidden Canvas for snapshot capturing */}
        <canvas ref={captureCanvasRef} className="hidden" />

        {/* Visual CCTV Scanline & Vignette Effect */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_50%,rgba(0,0,0,0.4)_100%)]"></div>

        {/* Active Analysis Radar Scan Bar */}
        {isAnalyzing && (
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-pulse top-1/2 -translate-y-1/2 z-30 pointer-events-none"></div>
        )}

        {/* OSD On-Screen CCTV Display Layer */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-20">
          {/* Top-Left: Camera Info & Timestamp */}
          <div className="bg-black/65 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-[11px] leading-tight space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold tracking-wider">
                {feedMode === 'webcam'
                  ? 'CAM-01 [CÂMERA LOCAL DO PC]'
                  : feedMode === 'lan'
                  ? `${activeLanCamera.name.toUpperCase()} // ${activeLanCamera.ip}:${activeLanCamera.port} [${activeLanCamera.protocol}]`
                  : feedMode === 'sample'
                  ? activeSample.cameraName
                  : `ARQUIVO: ${uploadedFileName || 'IMAGEM'}`}
              </span>
            </div>
            <div className="text-slate-400 text-[10px]">{currentTimeStr}</div>
          </div>

          {/* Top-Right: Status & Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Unfreeze Feed Button */}
            {(feedMode === 'lan' || feedMode === 'sample') && !activeLanCamera.isRealStream && (
              <button
                onClick={handleUnfreezeFeed}
                className="px-2.5 py-1 rounded-md bg-indigo-950/80 backdrop-blur-md border border-indigo-700/60 text-indigo-200 hover:text-white hover:bg-indigo-900 text-[11px] font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                title="Destravar e reiniciar fluxo de vídeo da câmera"
              >
                <RefreshCw className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline">Descongelar</span>
              </button>
            )}

            {isAnalyzing && (
              <div className="bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-mono text-[10px] px-2 py-1 rounded-md flex items-center gap-1.5 shadow-lg animate-pulse">
                <Scan className="w-3 h-3 animate-spin" />
                <span>PROCESSANDO IA</span>
              </div>
            )}

            <div className="bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 text-rose-400 font-mono text-[11px] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span className="font-semibold tracking-wider">REC</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-md bg-black/65 backdrop-blur-md border border-white/10 text-white/80 hover:text-white transition-colors"
              title="Tela cheia"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CCTV Viewfinder Corner Marks */}
        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/30 pointer-events-none"></div>
        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/30 pointer-events-none"></div>
        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/30 pointer-events-none"></div>
        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/30 pointer-events-none"></div>

        {/* Real-time Bounding Box Overlay */}
        {currentAnalysis && currentAnalysis.detections && currentAnalysis.detections.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {currentAnalysis.detections.map((det, idx) => {
              const bbox = det.bounding_box_relative;
              if (!bbox) return null;

              // Ensure coordinates are 0-1
              const top = Math.max(0, Math.min(1, bbox.top));
              const left = Math.max(0, Math.min(1, bbox.left));
              const bottom = Math.max(top + 0.04, Math.min(1, bbox.bottom));
              const right = Math.max(left + 0.04, Math.min(1, bbox.right));

              const width = (right - left) * 100;
              const height = (bottom - top) * 100;

              const isSelected = selectedDetectionIndex === idx;
              const color = getCategoryColor(det.category);

              return (
                <div
                  key={idx}
                  style={{
                    top: `${top * 100}%`,
                    left: `${left * 100}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDetection(isSelected ? null : idx);
                  }}
                  className={`absolute border-2 ${color.border} pointer-events-auto cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'ring-4 ring-white/60 bg-white/10 z-20'
                      : 'hover:border-white hover:bg-white/5'
                  }`}
                >
                  {/* Bounding Box Header Tag */}
                  <div
                    className={`absolute -top-6 left-0 ${color.pill} text-white font-mono text-[10px] font-semibold px-2 py-0.5 rounded-t-sm shadow-md whitespace-nowrap flex items-center gap-1`}
                  >
                    <span>{det.label.toUpperCase()}</span>
                    <span className="opacity-80">
                      {Math.round((det.confidence > 1 ? det.confidence : det.confidence * 100))}%
                    </span>
                  </div>

                  {/* Corner Accent ticks */}
                  <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white"></div>
                  <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white"></div>
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white"></div>
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white"></div>

                  {/* Tooltip on selection */}
                  {isSelected && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-900/95 border border-slate-700 text-slate-100 p-2.5 rounded-lg shadow-xl text-xs z-30 pointer-events-auto">
                      <div className="font-semibold text-white flex items-center justify-between">
                        <span>{det.label}</span>
                        <span className="text-[10px] text-indigo-400 font-mono">
                          {det.category}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] mt-1">{det.attributes.description}</p>
                      <p className="text-slate-400 text-[10px] mt-1 font-mono italic">
                        {det.attributes.action_state}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state notice if analyzed and 0 detections */}
        {currentAnalysis && currentAnalysis.detections && currentAnalysis.detections.length === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 text-slate-300 px-3 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 z-20">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nenhum alvo de interesse detectado no frame</span>
          </div>
        )}
      </div>

      {/* Network Camera Scanner Modal */}
      <NetworkCameraScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSelectCamera={handleSelectNetworkCamera}
        activeCameraId={activeLanCamera.id}
      />

      {/* Autonomous Camera Intelligence & Auto-Connect Modal */}
      {isIntelligenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl my-auto">
            <CameraIntelligencePanel
              onClose={() => setIsIntelligenceModalOpen(false)}
              activeCameraId={activeLanCamera.id}
              onSelectCameraToView={(cam) => {
                handleSelectNetworkCamera(cam);
                setIsIntelligenceModalOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
