import type { SoundConfig, SoundState, Vector3, Position } from '../types/index.js';
import type { AudioEngine } from './AudioEngine.js';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * How far ahead of `currentTime` (seconds) propagation-delay ramps are
 * scheduled. Must exceed how far the audio thread renders ahead of the main
 * thread, plus the timer jitter of the controller's updates.
 */
const DELAY_LOOKAHEAD = 0.1;
/** A ramp ending closer to `currentTime` than this (seconds) is treated as finished. */
const DELAY_SCHEDULE_MARGIN = 0.02;

/**
 * Represents a single positioned audio source.
 * Manages its own Web Audio graph:
 * BufferSource → DelayNode → BiquadFilterNode → PannerNode → GainNode → masterGain.
 */
export class SoundSource extends EventEmitter {
  readonly id: string;
  readonly config: SoundConfig;

  private audioBuffer: AudioBuffer;
  private audioEngine: AudioEngine;

  private source: AudioBufferSourceNode | null = null;
  private delayNode: DelayNode;
  private filterNode: BiquadFilterNode;
  private panner: PannerNode;
  private gainNode: GainNode;

  private _state: SoundState = 'ready';
  private _geoPosition: Position;
  /** performance.now() (ms) when _geoPosition was last set. */
  private _geoPositionTime: number;
  private _audioPosition: Vector3 = { x: 0, y: 0, z: 0 };
  private startTime = 0;
  private pauseOffset = 0;
  /** Current Doppler pitch ratio; persisted so it survives source re-creation. */
  private _playbackRate = 1;
  /** Context time and value at which the last scheduled delay ramp ends. */
  private delayRampEnd = 0;
  private delayRampEndValue = 0;

  constructor(
    id: string,
    audioBuffer: AudioBuffer,
    audioEngine: AudioEngine,
    config: SoundConfig,
  ) {
    super();
    this.id = id;
    this.audioBuffer = audioBuffer;
    this.audioEngine = audioEngine;
    this.config = config;
    this._geoPosition = { lng: config.position[0], lat: config.position[1], alt: config.position[2] };
    this._geoPositionTime = performance.now();

    this.panner = audioEngine.createPannerNode(config.pannerOptions);
    this.delayNode = audioEngine.createDelayNode();
    this.filterNode = audioEngine.createFilterNode();
    this.gainNode = audioEngine.createGainNode(config.volume ?? 1.0);
    this.delayNode.connect(this.filterNode);
    this.filterNode.connect(this.panner);
    this.panner.connect(this.gainNode);
    this.gainNode.connect(audioEngine.getMasterGain());
  }

  play(): void {
    if (this._state === 'playing') return;

    const ctx = this.audioEngine.getContext();
    this.source = ctx.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.loop = this.config.loop ?? false;
    this.source.playbackRate.value = this._playbackRate;
    this.source.connect(this.delayNode);

    const rawOffset = this._state === 'paused' ? this.pauseOffset : 0;
    // Looped sources accumulate pauseOffset past buffer.duration; normalise so
    // the browser doesn't receive an out-of-range offset (undefined behaviour).
    const offset =
      this.config.loop && this.audioBuffer.duration > 0
        ? rawOffset % this.audioBuffer.duration
        : rawOffset;
    this.source.start(0, offset);
    this.startTime = ctx.currentTime - offset;
    this._state = 'playing';

    this.source.onended = () => {
      // Only trigger 'ended' if the sound finished naturally (not paused/stopped)
      if (this._state === 'playing') {
        this._state = 'stopped';
        this.pauseOffset = 0;
        this.emit('ended');
      }
    };

    this.emit('playing');
  }

  pause(): void {
    if (this._state !== 'playing' || !this.source) return;

    this.pauseOffset = this.audioEngine.getContext().currentTime - this.startTime;
    this.source.onended = null;
    this.source.stop();
    this.source = null;
    this._state = 'paused';
    this.emit('paused');
  }

  stop(): void {
    if (this._state === 'stopped') return;

    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = null;
    }
    this.pauseOffset = 0;
    this._state = 'stopped';
    this.emit('stopped');
  }

  setPosition(pos: Vector3): void {
    this._audioPosition = pos;
    const p = this.panner;
    if ('positionX' in p) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  setVolume(volume: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Sets the Doppler playback-rate ratio (1 = no shift, >1 = higher pitch).
   * Applied to the live source with optional setTargetAtTime smoothing; the
   * value is remembered so it is re-applied when the source is re-created
   * (e.g. after culling resumes playback).
   */
  setPlaybackRate(rate: number, smoothing = 0): void {
    this._playbackRate = rate;
    if (!this.source) return;

    const param = this.source.playbackRate;
    const setTarget = (param as AudioParam).setTargetAtTime;
    if (smoothing > 0 && typeof setTarget === 'function') {
      param.setTargetAtTime(rate, this.audioEngine.getContext().currentTime, smoothing);
    } else {
      param.value = rate;
    }
  }

  getPlaybackRate(): number {
    return this._playbackRate;
  }

  /**
   * Sets the propagation-delay time (seconds it takes the sound to travel
   * from the source to the listener). With `rampTime > 0` the delay moves
   * linearly to the new value, in a ramp that starts where the previous one
   * ends and finishes `DELAY_LOOKAHEAD + rampTime` seconds after `sampledAt`
   * — for continuous motion, called once per update with `rampTime` set to
   * the update interval and `sampledAt` (performance.now() ms) set to when
   * the positions behind `delaySeconds` were last updated. Anchoring each
   * ramp to that time, rather than to when the update ran, makes the slope
   * the true rate of change even though positions arrive once per rendered
   * frame and updates run on a jittery timer. With `rampTime = 0` (default)
   * it is applied instantly —
   * used to snap across discontinuities (map jumps, teleported sounds)
   * instead of sweeping the delay audibly.
   * Clamped to the node's fixed capacity (see AudioEngine.createDelayNode).
   *
   * The ramp is linear on purpose: the rate at which the delay changes sets
   * the pitch heard (1 − d'(t)), so a constant slope gives a steady pitch.
   * An exponential approach (setTargetAtTime) would change the slope within
   * every update and make the pitch warble at the update rate.
   *
   * Ramps are chained in the future, never cut short. The audio thread has
   * already rendered past `currentTime`, so cancelling or holding the
   * automation at `currentTime` rewrites audio-rate delay values that were
   * already used, and the delay jumps: an audible click on every update.
   */
  setPropagationDelay(delaySeconds: number, rampTime = 0, sampledAt = performance.now()): void {
    const clamped = Math.max(0, Math.min(delaySeconds, this.delayNode.delayTime.maxValue));
    const param = this.delayNode.delayTime;
    const now = this.audioEngine.getContext().currentTime;
    if (rampTime > 0 && typeof param.linearRampToValueAtTime === 'function') {
      let end = this.audioEngine.contextTimeAt(sampledAt) + DELAY_LOOKAHEAD + rampTime;
      // The previous ramp has finished, or is about to finish before the
      // audio thread could pick up a new one (a late update): hold its end
      // value until the new ramp can safely start.
      if (this.delayRampEnd < now + DELAY_SCHEDULE_MARGIN) {
        const start = now + DELAY_LOOKAHEAD;
        param.setValueAtTime(this.delayRampEndValue, start);
        end = Math.max(end, start + rampTime);
      }
      // Nothing has moved since the last ramp was scheduled.
      if (end <= this.delayRampEnd) return;
      this.delayRampEnd = end;
      this.delayRampEndValue = clamped;
      param.linearRampToValueAtTime(clamped, end);
    } else {
      param.cancelScheduledValues(now);
      param.value = clamped;
      this.delayRampEnd = now;
      this.delayRampEndValue = clamped;
    }
  }

  getPropagationDelay(): number {
    return this.delayNode.delayTime.value;
  }

  /**
   * Sets the air-absorption lowpass cutoff (Hz) — lower means more muffled.
   * With `smoothing > 0` the change is ramped via setTargetAtTime for
   * continuous motion; with `smoothing = 0` (default) it is applied
   * instantly — used to snap across discontinuities (map jumps, teleported
   * sounds) instead of sweeping the filter audibly.
   */
  setAirAbsorptionCutoff(frequencyHz: number, smoothing = 0): void {
    const param = this.filterNode.frequency;
    const clamped = Math.max(param.minValue, Math.min(frequencyHz, param.maxValue));
    const ctx = this.audioEngine.getContext();
    const setTarget = (param as AudioParam).setTargetAtTime;
    if (smoothing > 0 && typeof setTarget === 'function') {
      param.setTargetAtTime(clamped, ctx.currentTime, smoothing);
    } else {
      param.cancelScheduledValues(ctx.currentTime);
      param.value = clamped;
    }
  }

  getAirAbsorptionCutoff(): number {
    return this.filterNode.frequency.value;
  }

  getVolume(): number {
    return this.gainNode.gain.value;
  }

  get state(): SoundState {
    return this._state;
  }

  get geoPosition(): Position {
    return this._geoPosition;
  }

  /**
   * performance.now() (ms) when the geographic position was last set. Lets
   * the controllers time distance changes by when they happened, not by when
   * their own timers happened to sample them.
   */
  get geoPositionTime(): number {
    return this._geoPositionTime;
  }

  get audioPosition(): Vector3 {
    return { ...this._audioPosition };
  }

  setGeoPosition(position: [number, number, number?]): void {
    this._geoPosition = { lng: position[0], lat: position[1], alt: position[2] };
    this._geoPositionTime = performance.now();
  }

  dispose(): void {
    this.stop();
    this.delayNode.disconnect();
    this.filterNode.disconnect();
    this.panner.disconnect();
    this.gainNode.disconnect();
    this.removeAllListeners();
  }
}
