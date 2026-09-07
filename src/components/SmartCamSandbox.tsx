import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  Sun,
  Moon,
  CloudRain,
  Wind,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Camera,
  Layers,
  Sparkles,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  SandboxSceneType,
  SandboxLighting,
  SandboxWeather,
  SandboxEntity,
  SmartCamAnalysisResponse,
} from '../types';
import { renderSandboxFrame } from '../utils/sandboxRenderer';

interface SmartCamSandboxProps {
  onAnalyzeFrame: (base64Image: string, timestamp: string, sourceName: string) => Promise<void>;
  isAnalyzing: boolean;
  currentAnalysis: SmartCamAnalysisResponse | null;
  selectedDetectionIndex: number | null;
  onSelectDetection: (index: number | null) => void;
}

export const SmartCamSandbox: React.FC<SmartCamSandboxProps> = ({
  onAnalyzeFrame,
  isAnalyzing,
  currentAnalysis,
  selectedDetectionIndex,
  onSelectDetection,
}) => {
  const [scene, setScene] = useState<SandboxSceneType>('porch');
  const [lighting, setLighting] = useState<SandboxLighting>('day');
  const [weather, setWeather] = useState<SandboxWeather>('clear');
  const [zoom, setZoom] = useState<number>(1);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null);

  // Initial sandbox entities
  const [entities, setEntities] = useState<SandboxEntity[]>([
    {
      id: 'ent_courier',
      type: 'courier',
      category: 'person',
      name: 'Entregador de Uniforme',
      x: 0.65,
      y: 0.58,
      size: 1.0,
      speed: 0.001,
      direction: 1,
      state: 'caminhando com pacote',
    },
    {
      id: 'ent_package',
      type: 'package',
      category: 'object',
      name: 'Pacote na Porta',
      x: 0.28,
      y: 0.72,
      size: 1.1,
      speed: 0,
      direction: 0,
      state: 'deixado no chão da entrada',
    },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Animation and physics refs (decoupled from React re-renders to guarantee 0% freeze)
  const entitiesRef = useRef<SandboxEntity[]>(entities);
  const sceneRef = useRef<SandboxSceneType>(scene);
  const lightingRef = useRef<SandboxLighting>(lighting);
  const weatherRef = useRef<SandboxWeather>(weather);
  const zoomRef = useRef<number>(zoom);
  const isStreamingRef = useRef<boolean>(isStreaming);
  const tickRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const draggedIdRef = useRef<string | null>(null);

  // Synchronize state changes to refs
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    lightingRef.current = lighting;
  }, [lighting]);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Robust render loop using requestAnimationFrame (smooth 30 FPS, zero React re-render thrashing)
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (time - lastTime >= 33) {
        lastTime = time;
        tickRef.current += 1;

        // Move entities without causing React re-renders
        if (isStreamingRef.current && !isDraggingRef.current) {
          for (const ent of entitiesRef.current) {
            if (ent.speed > 0) {
              ent.x += ent.speed * ent.direction;
              if (ent.x > 0.85) {
                ent.x = 0.85;
                ent.direction = -1;
              } else if (ent.x < 0.15) {
                ent.x = 0.15;
                ent.direction = 1;
              }
            }
          }
        }

        // Draw directly to canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            renderSandboxFrame(
              ctx,
              960,
              540,
              sceneRef.current,
              lightingRef.current,
              weatherRef.current,
              entitiesRef.current,
              tickRef.current,
              zoomRef.current
            );
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Force unfreeze / restart helper
  const handleUnfreeze = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsStreaming(true);
    isStreamingRef.current = true;
    isDraggingRef.current = false;
    draggedIdRef.current = null;
    setDraggedEntityId(null);
    tickRef.current = 0;

    let lastTime = performance.now();
    const loop = (time: number) => {
      if (time - lastTime >= 33) {
        lastTime = time;
        tickRef.current += 1;
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            renderSandboxFrame(
              ctx,
              960,
              540,
              sceneRef.current,
              lightingRef.current,
              weatherRef.current,
              entitiesRef.current,
              tickRef.current,
              zoomRef.current
            );
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  // Capture current canvas frame as JPEG Base64
  const captureSandboxFrame = useCallback(() => {
    if (!canvasRef.current || isAnalyzing) return;
    const base64 = canvasRef.current.toDataURL('image/jpeg', 0.88);
    const timestamp = new Date().toISOString();
    const sceneNames = {
      porch: 'SmartCam-Sandbox [Varanda]',
      backyard: 'SmartCam-Sandbox [Perímetro Noturno]',
      garage: 'SmartCam-Sandbox [Garagem]',
      hallway: 'SmartCam-Sandbox [Corredor]',
    };
    onAnalyzeFrame(base64, timestamp, sceneNames[scene]);
  }, [isAnalyzing, onAnalyzeFrame, scene]);

  // Add entity helper
  const addEntity = (type: SandboxEntity['type']) => {
    const configMap: Record<
      SandboxEntity['type'],
      { name: string; category: SandboxEntity['category']; x: number; y: number; state: string; size: number; speed: number }
    > = {
      courier: { name: 'Entregador', category: 'person', x: 0.5, y: 0.6, state: 'caminhando com caixa', size: 1, speed: 0.001 },
      intruder: { name: 'Suspeito Encapuzado', category: 'person', x: 0.52, y: 0.62, state: 'sondando com lanterna', size: 1.15, speed: 0.0005 },
      pedestrian: { name: 'Pedestre Comum', category: 'person', x: 0.45, y: 0.6, state: 'em pé conversando', size: 1, speed: 0 },
      car: { name: 'Veículo Sedan', category: 'vehicle', x: 0.35, y: 0.6, state: 'estacionado na vaga', size: 1.1, speed: 0 },
      dog: { name: 'Cão Caramelo', category: 'animal', x: 0.7, y: 0.68, state: 'andando solto', size: 1, speed: 0.002 },
      cat: { name: 'Gato Doméstico', category: 'animal', x: 0.6, y: 0.7, state: 'quieto no chão', size: 0.9, speed: 0 },
      package: { name: 'Pacote de Encomenda', category: 'object', x: 0.3, y: 0.72, state: 'no chão da varanda', size: 1.1, speed: 0 },
      open_gate: { name: 'Portão Aberto', category: 'object', x: 0.48, y: 0.5, state: 'aberto anormalmente', size: 1, speed: 0 },
    };

    const conf = configMap[type];
    const newEnt: SandboxEntity = {
      id: `ent_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      category: conf.category,
      name: conf.name,
      x: conf.x,
      y: conf.y,
      size: conf.size,
      speed: conf.speed,
      direction: 1,
      state: conf.state,
      isCustom: true,
    };

    setEntities((prev) => [...prev, newEnt]);
  };

  const removeEntity = (id: string) => {
    setEntities((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAllEntities = () => {
    setEntities([]);
  };

  // Canvas Click / Drag Handler to place entity
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Check if clicked near an entity to select or move
    const found = entitiesRef.current.find(
      (ent) => Math.hypot(ent.x - clickX, ent.y - clickY) < 0.09
    );
    if (found) {
      isDraggingRef.current = true;
      draggedIdRef.current = found.id;
      setDraggedEntityId(found.id);
    } else {
      isDraggingRef.current = false;
      draggedIdRef.current = null;
      setDraggedEntityId(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !draggedIdRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width));
    const newY = Math.max(0.2, Math.min(0.85, (e.clientY - rect.top) / rect.height));

    const target = entitiesRef.current.find((ent) => ent.id === draggedIdRef.current);
    if (target) {
      target.x = newX;
      target.y = newY;
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      draggedIdRef.current = null;
      setDraggedEntityId(null);
      // Persist finalized positions to React state without lag
      setEntities([...entitiesRef.current]);
    }
  };

  // Category Color helper
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'person':
        return { border: 'border-violet-400', pill: 'bg-violet-600' };
      case 'animal':
        return { border: 'border-emerald-400', pill: 'bg-emerald-600' };
      case 'vehicle':
        return { border: 'border-amber-400', pill: 'bg-amber-600' };
      default:
        return { border: 'border-cyan-400', pill: 'bg-cyan-600' };
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Sandbox Scenario Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
        {/* Scene Selection */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold mr-1">
            Ambiente:
          </span>
          {[
            { id: 'porch', label: 'Varanda / Entrada' },
            { id: 'backyard', label: 'Perímetro / Muro' },
            { id: 'garage', label: 'Garagem' },
            { id: 'hallway', label: 'Corredor Interno' },
          ].map((sc) => (
            <button
              key={sc.id}
              onClick={() => setScene(sc.id as SandboxSceneType)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                scene === sc.id
                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>

        {/* Lighting & Weather Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lighting Mode */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setLighting('day')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                lighting === 'day' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Iluminação Diurna"
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Dia</span>
            </button>
            <button
              onClick={() => setLighting('night_ir')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                lighting === 'night_ir' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Infravermelho Noturno (IR)"
            >
              <Moon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Noite (IR)</span>
            </button>
          </div>

          {/* Weather / Noise simulation */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setWeather('clear')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                weather === 'clear' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tempo Limpo"
            >
              <span className="text-[11px]">Limpo</span>
            </button>
            <button
              onClick={() => setWeather('rain')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                weather === 'rain' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Chuva & Gotas"
            >
              <CloudRain className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Chuva</span>
            </button>
            <button
              onClick={() => setWeather('windy_foliage')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                weather === 'windy_foliage' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vento em Folhagens (Teste de Filtragem de Ruído)"
            >
              <Wind className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Vento/Folhas</span>
            </button>
          </div>

          {/* Test & Snapshot Button */}
          <button
            onClick={captureSandboxFrame}
            disabled={isAnalyzing}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 disabled:text-emerald-300/50 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Testando no IA...' : 'Testar Frame no Motor IA'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Entity Spawner Tray */}
      <div className="bg-slate-900/70 border border-slate-800/80 p-2.5 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mr-1">
            Adicionar à Cena:
          </span>
          <button
            onClick={() => addEntity('courier')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Entregador
          </button>
          <button
            onClick={() => addEntity('intruder')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Invasor Noturno
          </button>
          <button
            onClick={() => addEntity('dog')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Cachorro
          </button>
          <button
            onClick={() => addEntity('cat')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Gato
          </button>
          <button
            onClick={() => addEntity('car')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-red-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Veículo
          </button>
          <button
            onClick={() => addEntity('package')}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1 border border-slate-700"
          >
            <Plus className="w-3 h-3" /> Pacote
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 font-mono">
            {entities.length} {entities.length === 1 ? 'alvo ativo' : 'alvos ativos'}
          </span>
          <button
            onClick={clearAllEntities}
            className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
            title="Limpar todos os alvos da cena"
          >
            <Trash2 className="w-3 h-3" /> Limpar Cena
          </button>
        </div>
      </div>

      {/* Main Sandbox Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center select-none"
      >
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="w-full h-full object-cover cursor-crosshair"
        />

        {/* CCTV OSD Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-20">
          <div className="bg-black/65 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-[11px] space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-bold tracking-wider text-emerald-400">
                AO VIVO • 30 FPS
              </span>
              <span className="text-slate-400">|</span>
              <span className="font-bold tracking-wider">
                SMARTCAM-SIM // {scene.toUpperCase()} // RTSP://192.168.1.120:554/LIVE
              </span>
            </div>
            <div className="text-slate-400 text-[10px]">
              MODO: {lighting === 'night_ir' ? 'INFRARED NIGHT VISION' : 'RGB COLOR DAY'} | CLIMA: {weather.toUpperCase()} | ARRASTE OS ALVOS NA TELA
            </div>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Unfreeze / Reset stream */}
            <button
              onClick={handleUnfreeze}
              className="px-2.5 py-1.5 rounded-md bg-indigo-950/80 backdrop-blur-md border border-indigo-700/60 text-indigo-200 hover:text-white hover:bg-indigo-900 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              title="Reiniciar e destravar loop de renderização da câmera"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Descongelar Feed</span>
            </button>

            {/* Play/Pause stream toggle */}
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className="p-1.5 rounded-md bg-black/65 backdrop-blur-md border border-white/10 text-white/80 hover:text-white"
              title={isStreaming ? 'Pausar animação da câmera' : 'Retomar animação da câmera'}
            >
              {isStreaming ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
            </button>

            {/* Zoom Controls */}
            <button
              onClick={() => setZoom((z) => Math.min(2.0, z + 0.25))}
              className="p-1.5 rounded-md bg-black/65 backdrop-blur-md border border-white/10 text-white/80 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(1.0, z - 0.25))}
              className="p-1.5 rounded-md bg-black/65 backdrop-blur-md border border-white/10 text-white/80 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Bounding Box Overlay from Gemini Motor */}
        {currentAnalysis && currentAnalysis.detections && currentAnalysis.detections.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {currentAnalysis.detections.map((det, idx) => {
              const bbox = det.bounding_box_relative;
              if (!bbox) return null;

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
                    isSelected ? 'ring-4 ring-white/60 bg-white/10 z-20' : 'hover:border-white hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`absolute -top-6 left-0 ${color.pill} text-white font-mono text-[10px] font-semibold px-2 py-0.5 rounded-t-sm shadow-md whitespace-nowrap flex items-center gap-1`}
                  >
                    <span>{det.label.toUpperCase()}</span>
                    <span className="opacity-80">
                      {Math.round(det.confidence > 1 ? det.confidence : det.confidence * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* User drag hint overlay */}
        <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm border border-white/10 text-slate-400 px-2.5 py-1 rounded text-[10px] font-mono pointer-events-none">
          Dica: Clique e arraste os alvos para posicionar
        </div>
      </div>
    </div>
  );
};
