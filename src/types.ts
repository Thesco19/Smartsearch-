export type DetectionCategory = 'person' | 'animal' | 'object' | 'vehicle';

export type AlertSeverity = 'low' | 'medium' | 'high';

export interface BoundingBoxRelative {
  top: number; // 0.0 to 1.0 (or percentage)
  left: number;
  bottom: number;
  right: number;
}

export interface DetectionAttributes {
  description: string;
  action_state: string;
}

export interface SmartCamDetection {
  category: DetectionCategory;
  label: string;
  confidence: number;
  bounding_box_relative: BoundingBoxRelative;
  attributes: DetectionAttributes;
}

export interface SmartCamEventAlert {
  triggered: boolean;
  severity: AlertSeverity;
  summary: string;
}

export interface SmartCamAnalysisResponse {
  timestamp: string;
  detections: SmartCamDetection[];
  event_alert: SmartCamEventAlert;
  processing_time_ms?: number;
}

export interface SecurityEventRecord {
  id: string;
  timestamp: string;
  frameThumbnail?: string;
  analysis: SmartCamAnalysisResponse;
  sourceType: 'webcam' | 'sample' | 'upload';
  sourceName: string;
}

export interface SecurityPreset {
  id: string;
  name: string;
  description: string;
  instructionContext: string;
}

export type SandboxSceneType = 'porch' | 'backyard' | 'garage' | 'hallway';
export type SandboxLighting = 'day' | 'night_ir' | 'dusk';
export type SandboxWeather = 'clear' | 'rain' | 'windy_foliage';

export interface SandboxEntity {
  id: string;
  type: 'courier' | 'intruder' | 'pedestrian' | 'car' | 'dog' | 'cat' | 'package' | 'open_gate';
  category: DetectionCategory;
  name: string;
  x: number; // 0 to 1
  y: number; // 0 to 1
  size: number;
  speed: number;
  direction: number; // angle or 1/-1
  state: string;
  isCustom?: boolean;
}

export interface SecurityTestCase {
  id: string;
  title: string;
  description: string;
  targetFocus: string;
  expectedCategory: DetectionCategory | 'none';
  shouldTriggerAlert: boolean;
  expectedSeverity?: AlertSeverity;
  sceneSetup: {
    scene: SandboxSceneType;
    lighting: SandboxLighting;
    weather: SandboxWeather;
    entities: SandboxEntity[];
    presetId: string;
    customNote?: string;
  };
}

export interface TestExecutionResult {
  testId: string;
  title: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  latencyMs?: number;
  detectionsCount: number;
  alertTriggered: boolean;
  alertSeverity?: AlertSeverity;
  alertSummary?: string;
  schemaValid: boolean;
  validationErrors: string[];
  rawResponse?: SmartCamAnalysisResponse;
}

export interface NetworkCamera {
  id: string;
  name: string;
  brand: string;
  model: string;
  ip: string;
  port: number;
  protocol: 'RTSP' | 'ONVIF' | 'HTTP' | 'MJPEG' | 'SNAPSHOT';
  streamUrl: string;
  resolution: string;
  fps: number;
  bitrate?: number;
  status: 'online' | 'offline' | 'auth_required';
  latencyMs: number;
  macAddress: string;
  location: string;
  sceneType: SandboxSceneType;
  lighting?: SandboxLighting;
  requiresAuth?: boolean;
  username?: string;
  isRealStream?: boolean;
  streamType?: 'mjpeg' | 'snapshot' | 'browser_device' | 'simulation';
  deviceId?: string;
}

export interface NetworkScanState {
  isScanning: boolean;
  progress: number;
  scannedCount: number;
  subnet: string;
  foundCameras: NetworkCamera[];
}

export interface LearnedCameraProfile {
  id: string;
  ip: string;
  port: number;
  brand: string;
  model: string;
  protocol: 'MJPEG' | 'SNAPSHOT' | 'RTSP' | 'ONVIF' | 'HTTP';
  streamPath: string;
  streamUrl: string;
  detectedAt: string;
  authType: 'none' | 'basic' | 'digest';
  username?: string;
  password?: string;
  latencyMs: number;
  fps: number;
  resolution: string;
  confidence: number;
  aiNotes?: string;
  testedCandidatePaths: string[];
  successfulPath: string;
  fallbackPath?: string;
  isAiResolved?: boolean;
}

export interface DiscoveryLogEvent {
  id: string;
  timestamp: string;
  phase: 'probe' | 'fingerprint' | 'ai_resolve' | 'negotiate' | 'learned' | 'failed';
  target: string;
  message: string;
  success?: boolean;
  details?: string;
}

export interface PortScanRecord {
  port: number;
  service: string;
  status: 'open' | 'closed' | 'timeout';
  latencyMs?: number;
  details?: string;
}

export interface ActiveHostRecord {
  ip: string;
  rttMs: number;
  status: 'alive' | 'timeout' | 'refused';
  probableType: 'gateway' | 'camera' | 'device' | 'unknown';
  isGateway?: boolean;
  portsScanned?: PortScanRecord[];
  hostname?: string;
  cameraProfile?: LearnedCameraProfile;
}

export interface NetworkDiagnosticReport {
  generatedAt: string;
  subnet: string;
  gatewayIp?: string;
  gatewayLatencyMs?: number;
  totalHostsScanned: number;
  activeHostsCount: number;
  activeHosts: ActiveHostRecord[];
  discoveredCameras: LearnedCameraProfile[];
  logText: string;
  recommendations: string[];
}
