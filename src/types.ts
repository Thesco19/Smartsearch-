export type DetectionCategory = 'person' | 'animal' | 'object' | 'vehicle';

export type AlertSeverity = 'low' | 'medium' | 'high';

export interface BoundingBoxRelative {
  top: number;
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

export interface AnalysisRequest {
  image: string;
  securityContext?: string;
  timestamp?: string;
}

export interface AnalysisResponse extends SmartCamAnalysisResponse {
  error?: string;
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
  x: number;
  y: number;
  size: number;
  speed: number;
  direction: number;
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

export interface NetworkCamera {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline';
  model?: string;
  macAddress?: string;
}

export interface NetworkScanState {
  isScanning: boolean;
  foundCameras: NetworkCamera[];
  progress: number;
}
