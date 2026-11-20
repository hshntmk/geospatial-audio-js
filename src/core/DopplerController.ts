import type { DopplerConfig, Position } from '../types/index.js';
import type { SoundManager } from './SoundManager.js';
import type { ListenerManager } from './ListenerManager.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import type { PropagationDelayController } from './PropagationDelayController.js';
import { logger } from '../utils/Logger.js';

const DEFAULTS: Required<Omit<DopplerConfig, 'enabled'>> = {
  speedOfSound: 343.3,
  dopplerFactor: 1.0,
  updateInterval: 100,
  maxPitchRatio: 2.0,
  smoothing: 0.05,
  listenerMotion: true,
};

const EARTH_RADIUS = 6_371_000; // metres

/** Per-sound bookkeeping for radial-velocity estimation. */
interface Sample {
  distance: number;
  geo: Position;
  time: number;
}

/**
 * Adds a Doppler pitch shift by tracking how fast the distance between the
 * listener and each sound changes (the radial velocity).
 *
 * The native Web Audio Doppler (PannerNode.setVelocity / dopplerFactor) was
 * removed from the spec, so the shift is computed here and applied to each
 * source's AudioBufferSourceNode.playbackRate:
 *
 *   ratio = c / (c + dopplerFactor · dr/dt)
 *
 * where dr/dt > 0 means the source is moving away (lower pitch) and dr/dt < 0
 * means it is approaching (higher pitch). Velocity is derived automatically
 * from successive positions, so moving sounds (updateSoundPosition) and map
 * movement (listener) are both reflected with no extra bookkeeping by callers.
 *
 * When propagation delay is also enabled, its changing DelayNode already
 * shifts the pitch by its own factor (PropagationDelayController
 * .getRateFactor). That factor is divided out of playbackRate here, so the
 * pitch heard is `ratio` above rather than the two shifts multiplied.
 */
export class DopplerController {
  private soundManager: SoundManager;
  private listenerManager: ListenerManager;
  private coordinateConverter: CoordinateConverter;
  private propagationDelay?: Pick<PropagationDelayController, 'getRateFactor'>;

  private config: Required<DopplerConfig> = { enabled: false, ...DEFAULTS };
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Last distance sample per sound id, used to estimate dr/dt. */
  private samples = new Map<string, Sample>();

  constructor(
    soundManager: SoundManager,
    listenerManager: ListenerManager,
    coordinateConverter: CoordinateConverter,
    propagationDelay?: Pick<PropagationDelayController, 'getRateFactor'>,
  ) {
    this.soundManager = soundManager;
    this.listenerManager = listenerManager;
    this.coordinateConverter = coordinateConverter;
    this.propagationDelay = propagationDelay;
  }

  setConfig(config: DopplerConfig): void {
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
    logger.debug('DopplerController started.');
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
    const { speedOfSound: c, dopplerFactor, maxPitchRatio, smoothing } = this.config;
    const minRatio = 1 / maxPitchRatio;

    const seen = new Set<string>();

    for (const sound of this.soundManager.getAllSounds()) {
      // Only shift audible, playing sounds; reset others to neutral pitch.
      if (sound.state !== 'playing') {
        if (this.samples.delete(sound.id) && sound.getPlaybackRate() !== 1) {
          sound.setPlaybackRate(1, smoothing);
        }
        continue;
      }

      seen.add(sound.id);
      const geo = sound.geoPosition;
      const distance = this.coordinateConverter.calculateDistance(listenerPos, geo);
      // Time the sample by when the positions were last set, not by this
      // timer: positions arrive once per rendered frame, so timing by the
      // timer adds up to a frame's worth of error to every velocity estimate.
      const time = Math.max(sound.geoPositionTime, this.listenerManager.getPositionTime()) / 1000;
      const prev = this.samples.get(sound.id);
      // Snapshot the geo so an in-place mutation of the source can't corrupt the
      // previous sample we rely on for the next tick.
      this.samples.set(sound.id, { distance, geo: { ...geo }, time });

      // Need two samples to estimate dr/dt; first tick just primes the buffer.
      if (!prev) continue;
      const dt = time - prev.time;
      // Neither the sound nor the listener has moved since the last sample.
      if (dt <= 0) {
        if (sound.getPlaybackRate() !== 1) sound.setPlaybackRate(1, smoothing);
        continue;
      }

      // m/s, +ve = receding.
      // listenerMotion: total distance change (source + listener motion).
      // !listenerMotion: only the source's own velocity along the line of sight.
      const radialVelocity = this.config.listenerMotion
        ? (distance - prev.distance) / dt
        : this.sourceRadialVelocity(listenerPos, prev.geo, geo, dt);

      let ratio = c / (c + dopplerFactor * radialVelocity);
      // The delay line follows the total distance change regardless of
      // listenerMotion, so its factor is computed from that.
      ratio /= this.propagationDelay?.getRateFactor(prev.distance, distance, dt) ?? 1;
      ratio = Math.max(minRatio, Math.min(maxPitchRatio, ratio));

      sound.setPlaybackRate(ratio, smoothing);
    }

    // Drop stale samples for sounds that disappeared.
    for (const id of this.samples.keys()) {
      if (!seen.has(id)) this.samples.delete(id);
    }
  }

  /**
   * Radial velocity (m/s, +ve = receding) from the source's own motion only,
   * ignoring listener movement: the source's velocity vector projected onto the
   * current listener→source line of sight. Distances use a local east/north/up
   * (ENU) approximation in metres around the listener latitude.
   */
  private sourceRadialVelocity(listener: Position, prevGeo: Position, geo: Position, dt: number): number {
    const k = (Math.PI / 180) * EARTH_RADIUS;
    const cosLat = Math.cos((listener.lat * Math.PI) / 180);

    // Source velocity (ENU, m/s)
    const vE = ((geo.lng - prevGeo.lng) * k * cosLat) / dt;
    const vN = ((geo.lat - prevGeo.lat) * k) / dt;
    const vU = ((geo.alt ?? 0) - (prevGeo.alt ?? 0)) / dt;

    // Line of sight listener → source (ENU, m)
    const dE = (geo.lng - listener.lng) * k * cosLat;
    const dN = (geo.lat - listener.lat) * k;
    const dU = (geo.alt ?? 0) - (listener.alt ?? 0);

    const len = Math.hypot(dE, dN, dU);
    if (len < 1e-3) return 0; // source essentially at the listener — undefined direction

    return (vE * dE + vN * dN + vU * dU) / len;
  }

  private resetAll(): void {
    for (const sound of this.soundManager.getAllSounds()) {
      if (sound.getPlaybackRate() !== 1) sound.setPlaybackRate(1);
    }
    this.samples.clear();
  }
}