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
} from 'lucide-react';
import { SmartCamDetection, SmartCamAnalysisResponse, NetworkCamera } from '../types';
import { sampleFeeds, SampleFeed } from '../data/sampleFeeds';
import { defaultNetworkCameras } from '../data/networkCameras';
import { renderLanCameraFrame, renderSampleLiveCCTVOverlay } from '../utils/lanCameraRenderer';
import { NetworkCameraScanner } from './NetworkCameraScanner';

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
}

type FeedMode = 'lan' | 'sample' | 'webcam' | 'upload';

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
}) => {
  const [feedMode, setFeedMode] = useState<FeedMode>('lan');
  const [discoveredCameras, setDiscoveredCameras] = useState<NetworkCamera[]>(defaultNetworkCameras);
  const [activeLanCamera, setActiveLanCamera] = useState<NetworkCamera>(defaultNetworkCameras[0]);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const [activeSample, setActiveSample] = useState<SampleFeed>(sampleFeeds[0]);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lanTickRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

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

  // Continuous 30 FPS CCTV Animation Render Loop for LAN & Sample feeds (Zero-Freeze Guarantee)
  useEffect(() => {
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

            if (feedMode === 'lan') {
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

    if (feedMode === 'lan' || feedMode === 'sample') {
      animFrameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [feedMode, activeLanCamera, activeSample]);

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
            if (feedMode === 'lan') {
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

  // Start / Stop Webcam
  const startWebcam = async () => {
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      setWebcamStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Falha ao inicializar webcam:', err);
      setWebcamError(
        err.name === 'NotAllowedError'
          ? 'Permissão de câmera negada pelo usuário.'
          : 'Não foi possível conectar à câmera.'
      );
      setFeedMode('lan');
    }
  };

  const stopWebcam = useCallback(() => {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
      setWebcamStream(null);
    }
  }, [webcamStream]);

  // Switch Feed Mode
  const handleModeChange = (mode: FeedMode) => {
    if (feedMode === 'webcam' && mode !== 'webcam') {
      stopWebcam();
    }
    setFeedMode(mode);
    if (mode === 'webcam') {
      startWebcam();
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

    if (feedMode === 'webcam' && videoRef.current && videoRef.current.videoWidth > 0) {
      hiddenCanvas.width = videoRef.current.videoWidth;
      hiddenCanvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      return hiddenCanvas.toDataURL('image/jpeg', 0.85);
    } else if ((feedMode === 'lan' || feedMode === 'sample') && sampleCanvasRef.current) {
      return sampleCanvasRef.current.toDataURL('image/jpeg', 0.85);
    } else if (feedMode === 'upload' && uploadedImageSrc) {
      return uploadedImageSrc;
    }
    return null;
  }, [feedMode, uploadedImageSrc]);

  // Capture and Trigger Analysis
  const captureAndAnalyze = useCallback(async () => {
    if (isAnalyzing) return;
    const base64 = grabCurrentFrameBase64();
    if (!base64) return;

    let sourceName = 'Webcam Principal';
    if (feedMode === 'lan') {
      sourceName = `${activeLanCamera.name} [${activeLanCamera.ip}]`;
    } else if (feedMode === 'sample') {
      sourceName = activeSample.cameraName;
    } else if (feedMode === 'upload') {
      sourceName = uploadedFileName || 'Arquivo Enviado';
    }

    const timestamp = new Date().toISOString();
    await onAnalyzeFrame(base64, timestamp, sourceName);
  }, [isAnalyzing, grabCurrentFrameBase64, feedMode, activeLanCamera, activeSample, uploadedFileName, onAnalyzeFrame]);

  // Auto-detection loop
  useEffect(() => {
    if (!isAutoDetecting) return;
    const interval = setInterval(() => {
      captureAndAnalyze();
    }, autoIntervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [isAutoDetecting, autoIntervalSeconds, captureAndAnalyze]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImageSrc(result);
      setFeedMode('upload');
      // Auto analyze uploaded image
      setTimeout(() => {
        onAnalyzeFrame(result, new Date().toISOString(), file.name);
      }, 100);
    };
    reader.readAsDataURL(file);
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Helper for Category Colors
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'person':
        return {
          border: 'border-violet-400',
          bg: 'bg-violet-500/20',
          text: 'text-violet-200',
          pill: 'bg-violet-600',
        };
      case 'animal':
        return {
          border: 'border-emerald-400',
          bg: 'bg-emerald-500/20',
          text: 'text-emerald-200',
          pill: 'bg-emerald-600',
        };
      case 'vehicle':
        return {
          border: 'border-amber-400',
          bg: 'bg-amber-500/20',
          text: 'text-amber-200',
          pill: 'bg-amber-600',
        };
      default:
        return {
          border: 'border-cyan-400',
          bg: 'bg-cyan-500/20',
          text: 'text-cyan-200',
          pill: 'bg-cyan-600',
        };
    }
  };

  // Selection handler from NetworkCameraScanner modal
  const handleSelectNetworkCamera = (cam: NetworkCamera) => {
    if (!discoveredCameras.some((c) => c.id === cam.id)) {
      setDiscoveredCameras((prev) => [cam, ...prev]);
    }
    setActiveLanCamera(cam);
    setFeedMode('lan');
    setIsScannerOpen(false);
    // Kick off an initial analysis for the newly connected camera
    setTimeout(() => {
      captureAndAnalyze();
    }, 400);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Source Selector Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* LAN Cameras Mode Button */}
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

          {/* Quick Scanner Modal Launcher */}
          <button
            id="open-scanner-modal-btn"
            onClick={() => {
              if (onOpenScanner) onOpenScanner();
              setIsScannerOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-200 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Buscar câmeras IP na rede local (Hikvision, Intelbras, Dahua, ONVIF, RTSP)"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="hidden sm:inline">Buscar Câmeras</span>
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
            id="feed-mode-webcam"
            onClick={() => handleModeChange('webcam')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              feedMode === 'webcam'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Câmera Local (Webcam)</span>
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
            <span>Carregar Imagem / Vídeo</span>
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
            <span>{isAutoDetecting ? 'Pausar Monitoramento' : 'Monitoramento Contínuo'}</span>
          </button>

          <button
            id="analyze-now-button"
            onClick={captureAndAnalyze}
            disabled={isAnalyzing}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 disabled:text-indigo-400/50 text-white flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Analisando Frame...' : 'Analisar Agora'}</span>
          </button>
        </div>
      </div>

      {/* Discovered LAN Cameras Pills */}
      {feedMode === 'lan' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-cyan-400 shrink-0 font-medium text-[11px] uppercase tracking-wider flex items-center gap-1">
            <Wifi className="w-3 h-3" /> Câmeras na Rede:
          </span>
          {discoveredCameras.map((cam) => (
            <button
              key={cam.id}
              onClick={() => setActiveLanCamera(cam)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                activeLanCamera.id === cam.id
                  ? 'bg-slate-800 text-cyan-300 border-cyan-500/60 font-medium shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{cam.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">({cam.ip})</span>
            </button>
          ))}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-2.5 py-1 rounded-md text-[11px] bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <Radio className="w-3 h-3 text-cyan-400" /> + Nova Varredura
          </button>
        </div>
      )}

      {/* Scenario Pills for Sample Mode */}
      {feedMode === 'sample' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 shrink-0 font-medium text-[11px] uppercase tracking-wider">
            Cenários CCTV:
          </span>
          {sampleFeeds.map((feed) => (
            <button
              key={feed.id}
              onClick={() => {
                setActiveSample(feed);
              }}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-all border ${
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
        className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group select-none"
      >
        {/* Render Feed Media */}
        {feedMode === 'webcam' && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
        )}

        {(feedMode === 'lan' || feedMode === 'sample') && (
          <canvas
            ref={sampleCanvasRef}
            className="w-full h-full object-cover"
          />
        )}

        {feedMode === 'upload' && uploadedImageSrc && (
          <img
            src={uploadedImageSrc}
            alt="Feed carregado"
            className="w-full h-full object-contain bg-slate-950"
          />
        )}

        {feedMode === 'webcam' && webcamError && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-rose-300 z-20">
            <AlertCircle className="w-12 h-12 mb-2 text-rose-500" />
            <h3 className="font-semibold text-base">Câmera Indisponível</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">{webcamError}</p>
            <button
              onClick={() => handleModeChange('lan')}
              className="mt-4 px-3.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 hover:bg-slate-700"
            >
              Alternar para Câmeras da Rede Local
            </button>
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
                {feedMode === 'lan'
                  ? `${activeLanCamera.name.toUpperCase()} // ${activeLanCamera.ip}:${activeLanCamera.port} [${activeLanCamera.protocol}]`
                  : feedMode === 'sample'
                  ? activeSample.cameraName
                  : feedMode === 'webcam'
                  ? 'CAM-01 [WEBCAM LOCAL]'
                  : `ARQUIVO: ${uploadedFileName || 'IMAGEM'}`}
              </span>
            </div>
            <div className="text-slate-400 text-[10px]">{currentTimeStr}</div>
          </div>

          {/* Top-Right: Status & Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Unfreeze Feed Button */}
            {(feedMode === 'lan' || feedMode === 'sample') && (
              <button
                onClick={handleUnfreezeFeed}
                className="px-2.5 py-1 rounded-md bg-indigo-950/80 backdrop-blur-md border border-indigo-700/60 text-indigo-200 hover:text-white hover:bg-indigo-900 text-[11px] font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                title="Destravar e reiniciar fluxo de vídeo da câmera"
              >
                <RefreshCw className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline">Descongelar Feed</span>
              </button>
            )}

            {isAnalyzing && (
              <div className="bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-mono text-[10px] px-2 py-1 rounded-md flex items-center gap-1.5 shadow-lg animate-pulse">
                <Scan className="w-3 h-3 animate-spin" />
                <span>PROCESSANDO MOTOR IA</span>
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

                  {/* Optional Tooltip on selection */}
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
    </div>
  );
};
