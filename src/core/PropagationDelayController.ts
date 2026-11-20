import type { PropagationDelayConfig } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { logger } from '../utils/Logger.js';

type Config = Required<Omit<PropagationDelayConfig, 'smoothing'>>;

const DEFAULTS: Omit<Config, 'enabled'> = {
  speedOfSound: 343.3,
  updateInterval: 100,
  maxDelayTime: 5,
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
 * ramped linearly between samples. A delay that changes over time also
 * shifts the pitch, exactly like a Doppler effect (see getRateFactor), and a
 * linear ramp keeps that shift steady. A distance change
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

  private config: Config = { enabled: false, ...DEFAULTS };
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

  /**
   * The playback-rate factor the DelayNode itself applies while the distance
   * to a sound changes from `prevDistance` to `distance` over `dt` seconds.
   * Reading a delay line whose delay grows by Δd over dt plays the audio
   * (1 − Δd/dt)× as fast — the same pitch shift a Doppler effect gives — so
   * DopplerController divides this out to avoid shifting the pitch twice.
   * Returns 1 when the delay is disabled or the change is a jump (snapped,
   * so no shift).
   */
  getRateFactor(prevDistance: number, distance: number, dt: number): number {
    const { enabled, speedOfSound, maxDelayTime, jumpThreshold } = this.config;
    if (!enabled || dt <= 0) return 1;
    if (Math.abs(distance - prevDistance) > jumpThreshold) return 1;

    const prevDelay = Math.min(prevDistance / speedOfSound, maxDelayTime);
    const delay = Math.min(distance / speedOfSound, maxDelayTime);
    // A source receding faster than sound would need a negative rate; keep
    // the factor positive and let the caller's pitch clamp handle it.
    return Math.max(1e-3, 1 - (delay - prevDelay) / dt);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private restart(): void {
    this.stop();
    this.start();
  }

  private update(): void {
    const listenerPos = this.listenerManager.getCurrentPosition();
    const { speedOfSound, maxDelayTime, updateInterval, jumpThreshold } = this.config;
    // One ramp per update, each as long as the update interval, chained end
    // to end (see SoundSource.setPropagationDelay).
    const rampTime = updateInterval / 1000;

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
      // When the positions behind `distance` were last set (see SoundSource.setPropagationDelay).
      const sampledAt = Math.max(sound.geoPositionTime, this.listenerManager.getPositionTime());
      const delayTime = Math.min(distance / speedOfSound, maxDelayTime);

      const prev = this.samples.get(sound.id);
      this.samples.set(sound.id, { distance });

      // No prior sample, or a jump larger than the threshold in one tick —
      // snap instantly rather than ramping across the discontinuity.
      if (!prev || Math.abs(distance - prev.distance) > jumpThreshold) {
        sound.setPropagationDelay(delayTime);
      } else {
        sound.setPropagationDelay(delayTime, rampTime, sampledAt);
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
