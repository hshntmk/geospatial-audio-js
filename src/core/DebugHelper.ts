import type { DebugConfig, DebugInfo, SoundDebugInfo } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { AudioEngine } from './AudioEngine.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { logger } from '../utils/Logger.js';

const DEFAULT_CONFIG: Required<DebugConfig> = {
  logAudioParams: false,
  logPerformance: false,
};

/**
 * Provides runtime diagnostics for geospatial-audio-js.
 *
 * Phase 2 scope: console-based logging and `getDebugInfo()` snapshots.
 * Map-overlay visualisation (markers, distance rings) is planned for Phase 3.
 */
export class DebugHelper {
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private audioEngine: AudioEngine;
  private coordinateConverter: CoordinateConverter;
  private config: Required<DebugConfig>;

  // Performance tracking
  private lastUpdateStart = 0;
  private updateDurations: number[] = [];
  private readonly MAX_SAMPLES = 60;

  constructor(
    soundManager: SoundManager,
    listenerManager: ListenerManager,
    audioEngine: AudioEngine,
    coordinateConverter: CoordinateConverter,
  ) {
    this.soundManager = soundManager;
    this.listenerManager = listenerManager;
    this.audioEngine = audioEngine;
    this.coordinateConverter = coordinateConverter;
    this.config = { ...DEFAULT_CONFIG };
  }

  enable(config: DebugConfig): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('DebugHelper enabled:', this.config);
  }

  disable(): void {
    this.config = { ...DEFAULT_CONFIG };
    logger.info('DebugHelper disabled.');
  }

  /**
   * Returns a snapshot of the current audio system state.
   * Useful for building custom debug UIs or logging to external systems.
   */
  getDebugInfo(): DebugInfo {
    const ctx = this.audioEngine.getContext();
    const listenerPos = this.listenerManager.getCurrentPosition();
    const sounds = this.soundManager.getAllSounds();

    const soundInfos: SoundDebugInfo[] = sounds.map(sound => ({
      id: sound.id,
      state: sound.state,
      geoPosition: sound.geoPosition,
      audioPosition: sound.audioPosition,
      volume: sound.getVolume(),
      distanceFromListener: this.coordinateConverter.calculateDistance(
        listenerPos,
        sound.geoPosition,
      ),
    }));

    return {
      activeSounds: sounds.filter(s => s.state === 'playing').length,
      totalSounds: sounds.length,
      culledSounds: sounds.filter(s => s.state === 'paused').length,
      audioContext: {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        currentTime: ctx.currentTime,
      },
      sounds: soundInfos,
    };
  }

  /**
   * Logs the audio parameters for a specific sound to the console.
   * Only active when `logAudioParams` is enabled.
   */
  logSoundParams(id: string): void {
    if (!this.config.logAudioParams) return;

    const sound = this.soundManager.getSound(id);
    if (!sound) {
      logger.warn(`[Debug] Sound "${id}" not found.`);
      return;
    }

    const listenerPos = this.listenerManager.getCurrentPosition();
    logger.info(`[Debug] Sound "${id}":`, {
      state: sound.state,
      geoPosition: sound.geoPosition,
      audioPosition: sound.audioPosition,
      volume: sound.getVolume(),
      distanceFromListener: Math.round(
        this.coordinateConverter.calculateDistance(listenerPos, sound.geoPosition),
      ) + 'm',
    });
  }

  /** Call at the start of each update cycle to track performance. */
  markUpdateStart(): void {
    if (!this.config.logPerformance) return;
    this.lastUpdateStart = performance.now();
  }

  /** Call at the end of each update cycle to record the elapsed time. */
  markUpdateEnd(): void {
    if (!this.config.logPerformance) return;
    const duration = performance.now() - this.lastUpdateStart;
    this.updateDurations.push(duration);
    if (this.updateDurations.length > this.MAX_SAMPLES) {
      this.updateDurations.shift();
    }

    const avg =
      this.updateDurations.reduce((a, b) => a + b, 0) / this.updateDurations.length;
    logger.debug(`[Debug] Update: ${duration.toFixed(2)}ms (avg ${avg.toFixed(2)}ms)`);
  }
}
