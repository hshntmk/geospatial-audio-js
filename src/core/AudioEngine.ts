import type { GeospatialAudioOptions, SoundPannerOptions, Vector3, ReverbConfig } from '../types/index.js';

/** How fast (s per s) the tracked clock offset may sink, to follow drift between the clocks. */
const CLOCK_DRIFT = 0.001;
/** A drop in the clock offset larger than this (s) means the context was suspended: start over. */
const CLOCK_RESET = 0.05;

const DEFAULTS: Required<GeospatialAudioOptions> = {
  distanceModel: 'inverse',
  refDistance: 5,
  maxDistance: 10_000,
  rolloffFactor: 1,
  panningModel: 'HRTF',
};

/**
 * Thin wrapper around the Web Audio API.
 * Owns the AudioContext and provides factory methods for audio nodes.
 */
export class AudioEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private options: Required<GeospatialAudioOptions>;
  /** Peak of currentTime − performance.now() (s) and when it was updated (ms); see contextTimeAt. */
  private clockOffset = -Infinity;
  private clockOffsetAt = 0;

  /** Capacity (seconds) for DelayNodes created by createDelayNode(). Fixed per-node at creation. */
  private propagationDelayMax = 5;

  // Reverb nodes (created on demand)
  private convolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  constructor(options?: GeospatialAudioOptions) {
    this.options = { ...DEFAULTS, ...options };

    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.audioContext = new Ctx();

    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
  }

  async ensureResumed(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async checkAutoplaySupport(): Promise<boolean> {
    return this.audioContext.state === 'running';
  }

  createPannerNode(customOptions?: SoundPannerOptions): PannerNode {
    const o = { ...this.options, ...customOptions };
    return new PannerNode(this.audioContext, {
      panningModel: o.panningModel,
      distanceModel: o.distanceModel,
      refDistance: o.refDistance,
      maxDistance: o.maxDistance,
      rolloffFactor: o.rolloffFactor,
      coneInnerAngle: o.coneInnerAngle ?? 360,
      coneOuterAngle: o.coneOuterAngle ?? 0,
      coneOuterGain: o.coneOuterGain ?? 0,
    });
  }

  createGainNode(initialGain = 1.0): GainNode {
    const gain = this.audioContext.createGain();
    gain.gain.value = initialGain;
    return gain;
  }

  /** Creates a DelayNode sized to the current propagation-delay capacity. */
  createDelayNode(): DelayNode {
    return new DelayNode(this.audioContext, { maxDelayTime: this.propagationDelayMax, delayTime: 0 });
  }

  /**
   * Sets the capacity used by future createDelayNode() calls. A DelayNode's
   * maxDelayTime is fixed at construction, so this only affects sounds added
   * afterwards — existing sounds keep their original capacity.
   */
  setPropagationDelayMax(seconds: number): void {
    this.propagationDelayMax = seconds;
  }

  /** Creates a lowpass BiquadFilterNode, wide open (20 kHz) until a controller narrows it. */
  createFilterNode(): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20_000;
    filter.Q.value = 0.707;
    return filter;
  }

  async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  setListenerPosition(x: number, y: number, z: number): void {
    const l = this.audioContext.listener;
    if ('positionX' in l) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
    }
  }

  setListenerOrientation(forward: Vector3, up: Vector3): void {
    const l = this.audioContext.listener;
    if ('forwardX' in l) {
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      (l as unknown as { setOrientation(...v: number[]): void }).setOrientation(
        forward.x, forward.y, forward.z,
        up.x, up.y, up.z,
      );
    }
  }

  /**
   * Enables or updates the reverb effect.
   *
   * Audio graph with reverb:
   *   masterGain ─┬─ dryGain ──────────────────── destination
   *               └─ reverbGain ── convolver ───── destination
   */
  setReverb(config: ReverbConfig): void {
    if (!config.enabled) {
      this.disableReverb();
      return;
    }

    // Build the reverb sub-graph on first call
    if (!this.convolver) {
      this.convolver  = this.audioContext.createConvolver();
      this.reverbGain = this.audioContext.createGain();
      this.dryGain    = this.audioContext.createGain();

      // Rewire: masterGain → dryGain → destination
      this.masterGain.disconnect();
      this.masterGain.connect(this.dryGain);
      this.dryGain.connect(this.audioContext.destination);

      // Wet path: masterGain → reverbGain → convolver → destination
      this.masterGain.connect(this.reverbGain);
      this.reverbGain.connect(this.convolver);
      this.convolver.connect(this.audioContext.destination);
    }

    this.convolver.buffer = config.customIR ?? this.generateIR(config);
    this.reverbGain!.gain.value = config.wet ?? 0.3;
    this.dryGain!.gain.value    = config.dry ?? 1.0;
  }

  disableReverb(): void {
    if (!this.convolver) return;

    this.masterGain.disconnect();
    this.convolver.disconnect();
    this.reverbGain!.disconnect();
    this.dryGain!.disconnect();

    this.masterGain.connect(this.audioContext.destination);

    this.convolver  = null;
    this.reverbGain = null;
    this.dryGain    = null;
  }

  setMasterVolume(volume: number): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  getMasterGain(): GainNode {
    return this.masterGain;
  }

  getContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Converts a performance.now() timestamp (ms) to AudioContext time, on the
   * same timeline as currentTime.
   *
   * currentTime only advances once per audio callback (several ms), too
   * coarse to time a delay ramp whose slope sets the pitch. So the offset
   * between the two clocks is measured on every call: it saw-tooths, peaking
   * right after currentTime steps, and that peak is the true offset. The
   * peak is tracked, sinking slowly to follow drift between the clocks, and
   * reset when the offset drops sharply (the context was suspended).
   *
   * getOutputTimestamp() is not used: it gives the time being heard, which
   * trails currentTime by the output latency (over 150 ms on Bluetooth).
   */
  contextTimeAt(performanceTime: number): number {
    const nowMs = performance.now();
    const offset = this.audioContext.currentTime - nowMs / 1000;
    const sunk = this.clockOffset - (CLOCK_DRIFT * (nowMs - this.clockOffsetAt)) / 1000;
    this.clockOffset = offset < this.clockOffset - CLOCK_RESET ? offset : Math.max(offset, sunk);
    this.clockOffsetAt = nowMs;
    return performanceTime / 1000 + this.clockOffset;
  }

  dispose(): void {
    this.disableReverb();
    void this.audioContext.close();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Generates a synthetic impulse response by shaping a noise burst
   * with an exponential decay envelope.
   *
   * Preset characteristics:
   *   room    — short decay (~1 s), suitable for indoor spaces
   *   hall    — long decay (~3 s), suitable for concert halls
   *   outdoor — very short decay (~0.4 s), minimal reflections
   */
  private generateIR(config: ReverbConfig): AudioBuffer {
    const PRESET_DECAY: Record<string, number> = {
      room:    1.0,
      hall:    3.0,
      outdoor: 0.4,
    };

    const decay  = config.decay ?? PRESET_DECAY[config.type ?? 'room'] ?? 1.0;
    const sr     = this.audioContext.sampleRate;
    const length = Math.floor(sr * decay);
    const ir     = this.audioContext.createBuffer(2, length, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // White noise × exponential decay
        data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * (i / length));
      }
    }

    return ir;
  }
}
