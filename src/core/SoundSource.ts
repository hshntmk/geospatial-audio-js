import type { SoundConfig, SoundState, Vector3, Position } from '../types/index.js';
import type { AudioEngine } from './AudioEngine.js';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Represents a single positioned audio source.
 * Manages its own Web Audio graph: BufferSource → PannerNode → GainNode → masterGain.
 */
export class SoundSource extends EventEmitter {
  readonly id: string;
  readonly config: SoundConfig;

  private audioBuffer: AudioBuffer;
  private audioEngine: AudioEngine;

  private source: AudioBufferSourceNode | null = null;
  private panner: PannerNode;
  private gainNode: GainNode;

  private _state: SoundState = 'ready';
  private _geoPosition: Position;
  private _audioPosition: Vector3 = { x: 0, y: 0, z: 0 };
  private startTime = 0;
  private pauseOffset = 0;
  /** Current Doppler pitch ratio; persisted so it survives source re-creation. */
  private _playbackRate = 1;

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

    this.panner = audioEngine.createPannerNode(config.pannerOptions);
    this.gainNode = audioEngine.createGainNode(config.volume ?? 1.0);
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
    this.source.connect(this.panner);

    const offset = this._state === 'paused' ? this.pauseOffset : 0;
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

  getVolume(): number {
    return this.gainNode.gain.value;
  }

  get state(): SoundState {
    return this._state;
  }

  get geoPosition(): Position {
    return this._geoPosition;
  }

  get audioPosition(): Vector3 {
    return { ...this._audioPosition };
  }

  setGeoPosition(position: [number, number, number?]): void {
    this._geoPosition = { lng: position[0], lat: position[1], alt: position[2] };
  }

  dispose(): void {
    this.stop();
    this.panner.disconnect();
    this.gainNode.disconnect();
    this.removeAllListeners();
  }
}
