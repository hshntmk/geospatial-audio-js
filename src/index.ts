export { GeospatialAudio } from './core/GeospatialAudio.js';

// Adapters
export { MapLibreAdapter } from './adapters/MapLibreAdapter.js';
export { LeafletAdapter }  from './adapters/LeafletAdapter.js';
export { CesiumAdapter }   from './adapters/CesiumAdapter.js';

export type {
  // Core types
  GeospatialAudioOptions,
  SoundConfig,
  SoundState,
  SoundPannerOptions,
  SoundInfo,
  Position,
  Vector3,
  Orientation,
  ListenerInfo,
  ScaleConfig,
  OptimizationConfig,
  LogLevel,
  PanningModelType,
  DistanceModelType,
  // Phase 2
  ReverbConfig,
  ReverbPreset,
  DopplerConfig,
  PropagationDelayConfig,
  DebugConfig,
  DebugInfo,
  SoundDebugInfo,
} from './types/index.js';

export type { MapAdapter } from './adapters/MapAdapter.js';
