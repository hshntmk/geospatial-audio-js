// ---- Geometry ----

export interface Position {
  lng: number;
  lat: number;
  alt?: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Orientation {
  bearing: number;
  pitch: number;
  roll: number;
}

// ---- Audio ----

export type SoundState = 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';

export type PanningModelType = 'HRTF' | 'equalpower';
export type DistanceModelType = 'linear' | 'inverse' | 'exponential';

export interface SoundPannerOptions {
  panningModel?: PanningModelType;
  distanceModel?: DistanceModelType;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  orientationX?: number;
  orientationY?: number;
  orientationZ?: number;
}

export interface SoundConfig {
  id: string;
  /** [longitude, latitude, altitude?] */
  position: [number, number, number?];
  url: string;
  loop?: boolean;
  volume?: number;
  autoplay?: boolean;
  /** Per-sound maximum hearing distance in meters. Overrides global cullingDistance. */
  maxDistance?: number;
  pannerOptions?: SoundPannerOptions;
}

export interface SoundInfo {
  id: string;
  state: SoundState;
  position: Position;
  volume: number;
}

// ---- Listener ----

export interface ListenerInfo {
  position: Position;
  orientation: Orientation;
  autoSync: boolean;
}

// ---- Library options ----

export interface GeospatialAudioOptions {
  distanceModel?: DistanceModelType;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  panningModel?: PanningModelType;
}

export interface ScaleConfig {
  horizontal?: number;
  vertical?: number;
  global?: number;
}

export interface OptimizationConfig {
  /** Maximum number of simultaneously playing sounds. Default: 10 */
  maxActiveSounds?: number;
  /** Distance in meters beyond which sounds are paused. Default: 5000 */
  cullingDistance?: number;
  /** How often (ms) the culling / priority check runs. Default: 100 */
  updateInterval?: number;
  priorityMode?: 'distance' | 'volume' | 'custom';
}

// ---- Reverb ----

export type ReverbPreset = 'room' | 'hall' | 'outdoor';

export interface ReverbConfig {
  enabled: boolean;
  type?: ReverbPreset;
  /** Reverb decay time in seconds. Default: 2.0 */
  decay?: number;
  /** Wet (reverb) level 0–1. Default: 0.3 */
  wet?: number;
  /** Dry (direct) level 0–1. Default: 1.0 */
  dry?: number;
  /** Custom impulse response buffer (used when type is omitted). */
  customIR?: AudioBuffer;
}

// ---- Debug ----

export interface DebugConfig {
  /** Log PannerNode parameters whenever a sound's position updates. */
  logAudioParams?: boolean;
  /** Log culling/optimizer timings. */
  logPerformance?: boolean;
}

export interface SoundDebugInfo {
  id: string;
  state: SoundState;
  geoPosition: Position;
  audioPosition: Vector3;
  volume: number;
  distanceFromListener: number;
}

export interface DebugInfo {
  activeSounds: number;
  totalSounds: number;
  culledSounds: number;
  audioContext: {
    state: string;
    sampleRate: number;
    currentTime: number;
  };
  sounds: SoundDebugInfo[];
}

// ---- Logging ----

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
