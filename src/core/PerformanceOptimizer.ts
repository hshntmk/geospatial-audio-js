import type { OptimizationConfig } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
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

  /** Tracks sounds that were auto-paused by culling (so we can auto-resume them). */
  private culledSounds = new Set<string>();

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

  private update(): void {
    this.cullDistantSounds();
    this.enforceMaxActiveSounds();
  }

  private cullDistantSounds(): void {
    const listenerPos = this.listenerManager.getCurrentPosition();

    for (const sound of this.soundManager.getAllSounds()) {
      const distance = this.coordinateConverter.calculateDistance(listenerPos, sound.geoPosition);
      const maxDist = sound.config.maxDistance ?? this.config.cullingDistance;

      if (distance > maxDist) {
        if (!this.culledSounds.has(sound.id) && sound.state === 'playing') {
          sound.pause();
          this.culledSounds.add(sound.id);
          this.eventEmitter.emit('soundCulled', sound.id);
          logger.debug(`Sound "${sound.id}" culled (${Math.round(distance)}m > ${maxDist}m).`);
        }
      } else {
        if (this.culledSounds.has(sound.id)) {
          this.culledSounds.delete(sound.id);
          sound.play(); // resumes from pause offset
          this.eventEmitter.emit('soundUnculled', sound.id);
          logger.debug(`Sound "${sound.id}" unculled (${Math.round(distance)}m ≤ ${maxDist}m).`);
        }
      }
    }
  }

  private enforceMaxActiveSounds(): void {
    const playing = this.soundManager.getAllSounds().filter(s => s.state === 'playing');
    if (playing.length <= this.config.maxActiveSounds) return;

    const listenerPos = this.listenerManager.getCurrentPosition();

    const sorted = [...playing].sort((a, b) => {
      const dA = this.coordinateConverter.calculateDistance(listenerPos, a.geoPosition);
      const dB = this.coordinateConverter.calculateDistance(listenerPos, b.geoPosition);
      return dA - dB; // ascending: closest first (highest priority)
    });

    sorted.slice(this.config.maxActiveSounds).forEach(sound => {
      sound.pause();
      this.culledSounds.add(sound.id);
      this.eventEmitter.emit('soundCulled', sound.id);
      logger.debug(`Sound "${sound.id}" culled (max active sounds exceeded).`);
    });
  }

  dispose(): void {
    this.stop();
    this.culledSounds.clear();
  }
}
