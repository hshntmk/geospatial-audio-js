import type { PropagationDelayConfig } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { logger } from '../utils/Logger.js';

const DEFAULTS: Required<Omit<PropagationDelayConfig, 'enabled'>> = {
  speedOfSound: 343.3,
  updateInterval: 100,
  maxDelayTime: 5,
  smoothing: 0.1,
  jumpThreshold: 500,
};

/** Last distance sample per sound id, used to tell continuous motion from a jump. */
interface Sample {
  distance: number;
}

/**
 * Delays each sound's audio by how long it would take the sound to travel
 * from the source to the listener — distance / speedOfSound — using a
 * DelayNode inserted into each SoundSource's audio graph (see
 * AudioEngine.createDelayNode / SoundSource.setPropagationDelay).
 *
 * During continuous motion (panning the map, or a moving sound) the delay is
 * ramped smoothly via AudioParam.setTargetAtTime, tracking the small,
 * frame-to-frame distance changes without artifacts. A distance change
 * larger than `jumpThreshold` in a single update — a map flyTo/setView, or a
 * sound teleported via updateSoundPosition — is treated as a discontinuity
 * and the delay is snapped instantly instead, avoiding an audible sweep
 * across the jump.
 *
 * A sound's own playback can finish (or be paused/culled) before its
 * DelayNode has finished draining the last `delayTime` seconds of audio —
 * that tail is left alone rather than force-zeroed, so it plays out in full.
 */
export class PropagationDelayController {
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private coordinateConverter: CoordinateConverter;

  private config: Required<PropagationDelayConfig> = { enabled: false, ...DEFAULTS };
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

  setConfig(config: PropagationDelayConfig): void {
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
    logger.debug('PropagationDelayController started.');
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
    const { speedOfSound, maxDelayTime, smoothing, jumpThreshold } = this.config;

    const seen = new Set<string>();

    for (const sound of this.soundManager.getAllSounds()) {
      // Only actively delay sounds currently playing. A sound whose source
      // just finished (or was paused/culled) may still have delayed audio
      // draining out of its DelayNode — do NOT zero its delayTime here, that
      // would yank the read position forward and truncate/garble the tail
      // that hasn't been heard yet. Just forget the distance sample so the
      // next time this sound plays, its delay snaps fresh (see the `!prev`
      // branch below) instead of ramping from a stale value.
      if (sound.state !== 'playing') {
        this.samples.delete(sound.id);
        continue;
      }

      seen.add(sound.id);
      const distance = this.coordinateConverter.calculateDistance(listenerPos, sound.geoPosition);
      const delayTime = Math.min(distance / speedOfSound, maxDelayTime);

      const prev = this.samples.get(sound.id);
      this.samples.set(sound.id, { distance });

      // No prior sample, or a jump larger than the threshold in one tick —
      // snap instantly rather than ramping across the discontinuity.
      if (!prev || Math.abs(distance - prev.distance) > jumpThreshold) {
        sound.setPropagationDelay(delayTime);
      } else {
        sound.setPropagationDelay(delayTime, smoothing);
      }
    }

    // Drop stale samples for sounds that disappeared.
    for (const id of this.samples.keys()) {
      if (!seen.has(id)) this.samples.delete(id);
    }
  }

  private resetAll(): void {
    for (const sound of this.soundManager.getAllSounds()) {
      if (sound.getPropagationDelay() !== 0) sound.setPropagationDelay(0);
    }
    this.samples.clear();
  }
}
