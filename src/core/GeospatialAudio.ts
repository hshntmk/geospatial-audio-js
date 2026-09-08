import type {
  GeospatialAudioOptions,
  SoundConfig,
  SoundState,
  ListenerInfo,
  OptimizationConfig,
  ScaleConfig,
  LogLevel,
  ReverbConfig,
  DopplerConfig,
  PropagationDelayConfig,
  DebugConfig,
  DebugInfo,
} from '../types/index.js';
import { AudioEngine } from './AudioEngine.js';
import { SoundManager } from './SoundManager.js';
import { ListenerManager } from './ListenerManager.js';
import { PerformanceOptimizer } from './PerformanceOptimizer.js';
import { DopplerController } from './DopplerController.js';
import { PropagationDelayController } from './PropagationDelayController.js';
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
  private dopplerController: DopplerController;
  private propagationDelayController: PropagationDelayController;
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
    // Spatialization shares the listener position tracked by ListenerManager,
    // so manual setListenerPosition() affects panning/volume — not just
    // culling and Doppler. With auto-sync on this is the map center as before.
    this.coordinateConverter.setOriginProvider(
      () => this.listenerManager.getCurrentPosition(),
    );
    this.performanceOptimizer = new PerformanceOptimizer(
      this.soundManager,
      this.listenerManager,
      this.coordinateConverter,
      this.eventEmitter,
    );
    this.dopplerController = new DopplerController(
      this.soundManager,
      this.listenerManager,
      this.coordinateConverter,
    );
    this.propagationDelayController = new PropagationDelayController(
      this.soundManager,
      this.listenerManager,
      this.coordinateConverter,
    );
    this.debugHelper = new DebugHelper(
      this.soundManager,
      this.listenerManager,
      this.audioEngine,
      this.coordinateConverter,
    );
    // Wire back so position updates and optimizer ticks reach the debug hooks
    // (no-ops until enableDebug() turns the corresponding flag on).
    this.soundManager.setDebugHelper(this.debugHelper);
    this.performanceOptimizer.setDebugHelper(this.debugHelper);

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
    this.mapAdapter.offCameraChange(this.onMapChange);
    this.performanceOptimizer.dispose();
    this.dopplerController.dispose();
    this.propagationDelayController.dispose();
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
    if (enabled) {
      // Re-sync immediately instead of waiting for the next map event.
      this.onMapChange();
    }
  }

  setListenerPosition(position: [number, number, number?]): void {
    this.listenerManager.setPosition(position);
    this.soundManager.updateAllPositions();
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

  // ── Doppler ──────────────────────────────────────────────────────────────

  /**
   * Enables or updates the Doppler effect. The pitch shift is derived
   * automatically from how the distance to each playing sound changes, so it
   * follows both moving sounds (updateSoundPosition) and listener/map movement.
   * Pass `{ enabled: false }` to disable and restore neutral pitch.
   */
  setDopplerEffect(config: DopplerConfig): void {
    this.dopplerController.setConfig(config);
  }

  // ── Propagation delay ────────────────────────────────────────────────────

  /**
   * Enables or updates the sound-propagation delay: each sound is delayed by
   * distance / speedOfSound, so distant sounds arrive noticeably later, like
   * real sound travel. The delay is derived automatically from distance and
   * follows both moving sounds and listener/map movement — continuous motion
   * ramps smoothly, while a jump (map flyTo/setView, a teleported sound)
   * snaps instantly to avoid an audible sweep. Pass `{ enabled: false }` to
   * disable and restore zero delay.
   */
  setPropagationDelay(config: PropagationDelayConfig): void {
    if (config.maxDelayTime !== undefined) {
      this.audioEngine.setPropagationDelayMax(config.maxDelayTime);
    }
    this.propagationDelayController.setConfig(config);
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
    this.mapAdapter.onCameraChange(this.onMapChange);
  }
}
