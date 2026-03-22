import type {
  GeospatialAudioOptions,
  SoundConfig,
  SoundState,
  ListenerInfo,
  OptimizationConfig,
  ScaleConfig,
  LogLevel,
  ReverbConfig,
  DebugConfig,
  DebugInfo,
} from '../types/index.js';
import { AudioEngine } from './AudioEngine.js';
import { SoundManager } from './SoundManager.js';
import { ListenerManager } from './ListenerManager.js';
import { PerformanceOptimizer } from './PerformanceOptimizer.js';
import { DebugHelper } from './DebugHelper.js';
import type { MapAdapter } from '../adapters/MapAdapter.js';
import { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { logger } from '../utils/Logger.js';

/**
 * Main entry point for geospatial-audio-js.
 *
 * @example
 * ```ts
 * import { GeospatialAudio, MapLibreAdapter } from 'geospatial-audio-js';
 *
 * const audio = new GeospatialAudio(new MapLibreAdapter(map));
 *
 * document.getElementById('start')!.addEventListener('click', async () => {
 *   await audio.initialize();
 *   await audio.addSound({ id: 'bell', position: [139.69, 35.69], url: 'bell.mp3', loop: true, autoplay: true });
 * });
 * ```
 */
export class GeospatialAudio {
  private mapAdapter: MapAdapter;
  private audioEngine: AudioEngine;
  private coordinateConverter: CoordinateConverter;
  private eventEmitter: EventEmitter;
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private performanceOptimizer: PerformanceOptimizer;
  private debugHelper: DebugHelper;

  /** Bound handler kept so we can remove it in dispose(). */
  private readonly onMapChange: () => void;

  constructor(adapter: MapAdapter, options?: GeospatialAudioOptions) {
    this.mapAdapter = adapter;
    this.audioEngine = new AudioEngine(options);
    this.coordinateConverter = new CoordinateConverter(this.mapAdapter);
    this.eventEmitter = new EventEmitter();

    this.soundManager = new SoundManager(
      this.audioEngine,
      this.coordinateConverter,
      this.eventEmitter,
    );
    this.listenerManager = new ListenerManager(
      this.audioEngine,
      this.mapAdapter,
      this.eventEmitter,
    );
    this.performanceOptimizer = new PerformanceOptimizer(
      this.soundManager,
      this.listenerManager,
      this.coordinateConverter,
      this.eventEmitter,
    );
    this.debugHelper = new DebugHelper(
      this.soundManager,
      this.listenerManager,
      this.audioEngine,
      this.coordinateConverter,
    );

    this.onMapChange = () => {
      this.listenerManager.updateFromMap();
      this.soundManager.updateAllPositions();
    };

    this.setupMapListeners();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Must be called after a user gesture to unlock the AudioContext.
   * Also performs the initial listener/position sync.
   */
  async initialize(): Promise<void> {
    await this.audioEngine.ensureResumed();
    this.listenerManager.updateFromMap();
    this.soundManager.updateAllPositions();
    this.performanceOptimizer.start();
    this.eventEmitter.emit('initialized');
    logger.info('Initialized.');
  }

  async checkAutoplaySupport(): Promise<boolean> {
    return this.audioEngine.checkAutoplaySupport();
  }

  dispose(): void {
    (['move', 'rotate', 'zoom', 'pitch'] as const).forEach(ev => {
      this.mapAdapter.off(ev, this.onMapChange);
    });
    this.performanceOptimizer.dispose();
    this.soundManager.dispose();
    this.audioEngine.dispose();
    this.eventEmitter.emit('disposed');
    this.eventEmitter.removeAllListeners();
    logger.info('Disposed.');
  }

  // ── Sound management ─────────────────────────────────────────────────────

  async addSound(config: SoundConfig): Promise<void> {
    return this.soundManager.addSound(config);
  }

  removeSound(id: string): void {
    this.soundManager.removeSound(id);
  }

  updateSoundPosition(id: string, position: [number, number, number?]): void {
    this.soundManager.updateSoundPosition(id, position);
  }

  playSound(id: string): void {
    this.soundManager.playSound(id);
  }

  pauseSound(id: string): void {
    this.soundManager.pauseSound(id);
  }

  stopSound(id: string): void {
    this.soundManager.stopSound(id);
  }

  setVolume(id: string, volume: number): void {
    this.soundManager.setVolume(id, volume);
  }

  getVolume(id: string): number {
    return this.soundManager.getVolume(id);
  }

  getSoundState(id: string): SoundState | undefined {
    return this.soundManager.getSoundState(id);
  }

  // ── Listener management ──────────────────────────────────────────────────

  syncWithMap(enabled: boolean): void {
    this.listenerManager.enableAutoSync(enabled);
  }

  setListenerPosition(position: [number, number, number?]): void {
    this.listenerManager.setPosition(position);
  }

  setListenerOrientation(bearing: number, pitch: number, roll?: number): void {
    this.listenerManager.setOrientation(bearing, pitch, roll);
  }

  getListenerInfo(): ListenerInfo {
    return this.listenerManager.getInfo();
  }

  // ── Optimization & scale ─────────────────────────────────────────────────

  setOptimization(config: Partial<OptimizationConfig>): void {
    this.performanceOptimizer.setConfig(config);
  }

  setScale(scale: ScaleConfig): void {
    this.coordinateConverter.setScale(scale);
  }

  // ── Events ───────────────────────────────────────────────────────────────

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  removeAllListeners(event?: string): void {
    this.eventEmitter.removeAllListeners(event);
  }

  // ── Reverb ───────────────────────────────────────────────────────────────

  setReverb(config: ReverbConfig): void {
    this.audioEngine.setReverb(config);
  }

  disableReverb(): void {
    this.audioEngine.disableReverb();
  }

  setMasterVolume(volume: number): void {
    this.audioEngine.setMasterVolume(volume);
  }

  // ── Debug ────────────────────────────────────────────────────────────────

  enableDebug(config: DebugConfig): void {
    this.debugHelper.enable(config);
  }

  disableDebug(): void {
    this.debugHelper.disable();
  }

  getDebugInfo(): DebugInfo {
    return this.debugHelper.getDebugInfo();
  }

  setLogLevel(level: LogLevel): void {
    logger.setLevel(level);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private setupMapListeners(): void {
    (['move', 'rotate', 'zoom', 'pitch'] as const).forEach(ev => {
      this.mapAdapter.on(ev, this.onMapChange);
    });
  }
}
