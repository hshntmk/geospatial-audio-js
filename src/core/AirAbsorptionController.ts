import type { AirAbsorptionConfig } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { logger } from '../utils/Logger.js';

const DEFAULTS: Required<Omit<AirAbsorptionConfig, 'enabled'>> = {
  maxCutoffFrequency: 20_000,
  minCutoffFrequency: 1_000,
  falloffDistance: 500,
  updateInterval: 100,
  Q: 0.707,
  smoothing: 0.1,
  jumpThreshold: 500,
};

/** Last distance sample per sound id, used to tell continuous motion from a jump. */
interface Sample {
  distance: number;
}

/**
 * Simulates air absorption: high frequencies are attenuated more than low
 * ones as sound travels through air, so distant sounds sound progressively
 * more muffled — not just quieter. Modeled as a lowpass filter (see
 * AudioEngine.createFilterNode / SoundSource.setAirAbsorptionCutoff) whose
 * cutoff decays exponentially with distance:
 *
 *   cutoff = minCutoffFrequency + (maxCutoffFrequency - minCutoffFrequency) × e^(-distance / falloffDistance)
 *
 * This is a perceptual approximation (a single-pole lowpass), not a
 * physically exact multi-band atmospheric-absorption model (e.g. ISO 9613-1) —
 * it is cheap to compute and matches the "air absorption" filter found in
 * most game-audio engines.
 *
 * As with PropagationDelayController, continuous motion ramps the cutoff
 * smoothly via AudioParam.setTargetAtTime, while a distance jump larger than
 * `jumpThreshold` in one tick snaps instantly to avoid an audible filter
 * sweep across the discontinuity.
 *
 * A sound's own playback can finish (or be paused/culled) before delayed
 * audio has finished draining through this filter (see
 * PropagationDelayController) — its cutoff is left alone rather than
 * force-opened, so that tail is still heard with the right amount of muffling.
 */
export class AirAbsorptionController {
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private coordinateConverter: CoordinateConverter;

  private config: Required<AirAbsorptionConfig> = { enabled: false, ...DEFAULTS };
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private samples = new Map<string, Sample>();

  constructor(
    soundManager: SoundManager,
    listenerManager: ListenerManager,
    coordinateConverter: CoordinateConverter,
  ) {
    this.soundManager = soundManager;
    this.listenerManager = listenerManager;
    this.coordinateConverter = coordinateConverter;
  }

  setConfig(config: AirAbsorptionConfig): void {
    this.config = { ...this.config, ...config };

    if (this.config.enabled) {
      this.restart();
    } else {
      this.stop();
      this.resetAll();
    }
  }

  start(): void {
    if (!this.config.enabled || this.intervalId !== null) return;
    this.samples.clear();
    this.intervalId = setInterval(() => this.update(), this.config.updateInterval);
    logger.debug('AirAbsorptionController started.');
  }

  stop(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  dispose(): void {
    this.stop();
    this.resetAll();
    this.samples.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private restart(): void {
    this.stop();
    this.start();
  }

  private update(): void {
    const listenerPos = this.listenerManager.getCurrentPosition();
    const { maxCutoffFrequency, minCutoffFrequency, falloffDistance, smoothing, jumpThreshold } = this.config;

    const seen = new Set<string>();

    for (const sound of this.soundManager.getAllSounds()) {
      // Only actively filter sounds currently playing. A sound whose source
      // just finished (or was paused/culled) may still have delayed audio
      // (see PropagationDelayController) draining through this filter later —
      // leave its cutoff alone rather than snapping it wide open, so that
      // tail is heard with the right amount of muffling. Just forget the
      // distance sample so the next time this sound plays, its cutoff snaps
      // fresh (see the `!prev` branch below) instead of ramping from a stale
      // value.
      if (sound.state !== 'playing') {
        this.samples.delete(sound.id);
        continue;
      }

      seen.add(sound.id);
      const distance = Math.max(0, this.coordinateConverter.calculateDistance(listenerPos, sound.geoPosition));
      const cutoff = minCutoffFrequency + (maxCutoffFrequency - minCutoffFrequency) * Math.exp(-distance / falloffDistance);

      const prev = this.samples.get(sound.id);
      this.samples.set(sound.id, { distance });

      // No prior sample, or a jump larger than the threshold in one tick —
      // snap instantly rather than ramping across the discontinuity.
      if (!prev || Math.abs(distance - prev.distance) > jumpThreshold) {
        sound.setAirAbsorptionCutoff(cutoff);
      } else {
        sound.setAirAbsorptionCutoff(cutoff, smoothing);
      }
    }

    // Drop stale samples for sounds that disappeared.
    for (const id of this.samples.keys()) {
      if (!seen.has(id)) this.samples.delete(id);
    }
  }

  private resetAll(): void {
    for (const sound of this.soundManager.getAllSounds()) {
      if (sound.getAirAbsorptionCutoff() !== this.config.maxCutoffFrequency) {
        sound.setAirAbsorptionCutoff(this.config.maxCutoffFrequency);
      }
    }
    this.samples.clear();
  }
}
