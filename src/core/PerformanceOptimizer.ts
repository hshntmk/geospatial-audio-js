import type { OptimizationConfig } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import type { DebugHelper } from './DebugHelper.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { logger } from '../utils/Logger.js';

const DEFAULTS: Required<OptimizationConfig> = {
  maxActiveSounds: 10,
  cullingDistance: 5_000,
  updateInterval: 100,
  priorityMode: 'distance',
};

/**
 * Periodically checks sound distances and enforces:
 *   1. Distance-based culling  – sounds too far away are paused and resumed when back in range.
 *   2. Max simultaneous sounds – the farthest sounds are paused when the limit is exceeded.
 */
export class PerformanceOptimizer {
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private coordinateConverter: CoordinateConverter;
  private eventEmitter: EventEmitter;

  private config: Required<OptimizationConfig>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  /** Wired by GeospatialAudio after construction (for logPerformance timings). */
  private debugHelper: DebugHelper | null = null;

  /**
   * Sounds auto-paused because they went beyond their culling distance.
   * Kept separate from pausedByLimit: distance culling auto-resumes anything
   * back in range, which must not undo a max-active-sounds pause (that caused
   * a pause/play oscillation every tick).
   */
  private culledByDistance = new Set<string>();
  /** Sounds auto-paused because the max-active-sounds limit was exceeded. */
  private pausedByLimit = new Set<string>();

  constructor(
    soundManager: SoundManager,
    listenerManager: ListenerManager,
    coordinateConverter: CoordinateConverter,
    eventEmitter: EventEmitter,
  ) {
    this.soundManager = soundManager;
    this.listenerManager = listenerManager;
    this.coordinateConverter = coordinateConverter;
    this.eventEmitter = eventEmitter;
    this.config = { ...DEFAULTS };
  }

  setConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.intervalId !== null) {
      this.stop();
      this.start();
    }
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.update(), this.config.updateInterval);
    logger.debug('PerformanceOptimizer started.');
  }

  stop(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  setDebugHelper(debugHelper: DebugHelper): void {
    this.debugHelper = debugHelper;
  }

  private update(): void {
    this.debugHelper?.markUpdateStart();
    this.pruneStaleTracking();
    this.cullDistantSounds();
    this.enforceMaxActiveSounds();
    this.debugHelper?.markUpdateEnd();
  }

  /**
   * Both sets must only contain sounds that we paused and that are still
   * paused. Drops ids whose sound was removed, or that the user has since
   * played/stopped manually (our bookkeeping is stale in that case).
   */
  private pruneStaleTracking(): void {
    for (const set of [this.culledByDistance, this.pausedByLimit]) {
      for (const id of set) {
        if (this.soundManager.getSound(id)?.state !== 'paused') set.delete(id);
      }
    }
  }

  private cullDistantSounds(): void {
    const listenerPos = this.listenerManager.getCurrentPosition();

    for (const sound of this.soundManager.getAllSounds()) {
      const distance = this.coordinateConverter.calculateDistance(listenerPos, sound.geoPosition);
      const maxDist = sound.config.maxDistance ?? this.config.cullingDistance;

      if (distance > maxDist) {
        if (!this.culledByDistance.has(sound.id) && sound.state === 'playing') {
          sound.pause();
          this.culledByDistance.add(sound.id);
          this.pausedByLimit.delete(sound.id);
          this.eventEmitter.emit('soundCulled', sound.id);
          logger.debug(`Sound "${sound.id}" culled (${Math.round(distance)}m > ${maxDist}m).`);
        }
      } else {
        if (this.culledByDistance.has(sound.id)) {
          this.culledByDistance.delete(sound.id);
          sound.play(); // resumes from pause offset
          this.eventEmitter.emit('soundUnculled', sound.id);
          logger.debug(`Sound "${sound.id}" unculled (${Math.round(distance)}m ≤ ${maxDist}m).`);
        }
      }
    }
  }

  private enforceMaxActiveSounds(): void {
    const listenerPos = this.listenerManager.getCurrentPosition();
    const playing = this.soundManager.getAllSounds().filter(s => s.state === 'playing');
    const headroom = this.config.maxActiveSounds - playing.length;

    if (headroom < 0) {
      // Over the limit: pause the farthest sounds. They go into pausedByLimit
      // (not culledByDistance) so distance culling won't resume them next tick.
      const sorted = [...playing].sort((a, b) => {
        const dA = this.coordinateConverter.calculateDistance(listenerPos, a.geoPosition);
        const dB = this.coordinateConverter.calculateDistance(listenerPos, b.geoPosition);
        return dA - dB; // ascending: closest first (highest priority)
      });

      sorted.slice(this.config.maxActiveSounds).forEach(sound => {
        sound.pause();
        this.pausedByLimit.add(sound.id);
        this.eventEmitter.emit('soundCulled', sound.id);
        logger.debug(`Sound "${sound.id}" paused (max active sounds exceeded).`);
      });
      return;
    }

    if (headroom === 0 || this.pausedByLimit.size === 0) return;

    // Slots freed up: resume the closest limit-paused sounds still in range.
    const candidates = Array.from(this.pausedByLimit, id => this.soundManager.getSound(id))
      .filter(s => s !== undefined)
      .map(s => ({
        sound: s,
        distance: this.coordinateConverter.calculateDistance(listenerPos, s.geoPosition),
      }))
      .filter(({ sound, distance }) =>
        distance <= (sound.config.maxDistance ?? this.config.cullingDistance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, headroom);

    for (const { sound } of candidates) {
      this.pausedByLimit.delete(sound.id);
      sound.play();
      this.eventEmitter.emit('soundUnculled', sound.id);
      logger.debug(`Sound "${sound.id}" resumed (active-sound slot available).`);
    }
  }

  dispose(): void {
    this.stop();
    this.culledByDistance.clear();
    this.pausedByLimit.clear();
  }
}
