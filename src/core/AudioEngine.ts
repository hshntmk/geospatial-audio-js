import type { GeospatialAudioOptions, SoundPannerOptions, Vector3, ReverbConfig, LimiterConfig } from '../types/index.js';

/** How fast (s per s) the tracked clock offset may sink, to follow drift between the clocks. */
const CLOCK_DRIFT = 0.001;
/** A drop in the clock offset larger than this (s) means the context was suspended: start over. */
const CLOCK_RESET = 0.05;

// Output limiter settings (see setLimiter).
const LIMITER_THRESHOLD = -3; // dBFS
const LIMITER_RATIO = 20;
const LIMITER_ATTACK = 0.003; // s
const LIMITER_RELEASE = 0.25; // s

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
  /**
   * Where each sound's reverb send goes (see SoundSource). Feeds the reverb
   * only while distance-based reverb is on; its gain mirrors the master
   * volume, since the sends bypass masterGain.
   */
  private reverbSendBus: GainNode;
  /**
   * The last node before the destination; everything audible goes through
   * it, so the limiter (see setLimiter) can be inserted in one place.
   */
  private output: GainNode;
  // Limiter nodes, present only while the limiter is on.
  private limiter: DynamicsCompressorNode | null = null;
  private limiterTrim: GainNode | null = null;
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
  /** ReverbConfig.distanceRolloff while distance-based reverb is on, else null. */
  private reverbDistanceRolloff: number | null = null;

  constructor(options?: GeospatialAudioOptions) {
    this.options = { ...DEFAULTS, ...options };

    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.audioContext = new Ctx();

    this.masterGain = this.audioContext.createGain();
    this.output = this.audioContext.createGain();
    this.output.connect(this.audioContext.destination);
    this.masterGain.connect(this.output);
    this.reverbSendBus = this.audioContext.createGain();
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
      // Web Audio's own defaults. coneOuterAngle used to default to 0, which
      // made a sound given only coneInnerAngle drop straight to coneOuterGain
      // at the inner cone's edge instead of fading out towards the back.
      coneInnerAngle: o.coneInnerAngle ?? 360,
      coneOuterAngle: o.coneOuterAngle ?? 360,
      coneOuterGain: o.coneOuterGain ?? 0,
      // Direction the sound faces, for the cones above. Same axes as sound
      // positions (X east, Y up, Z south); defaults are PannerNode's own.
      orientationX: o.orientationX ?? 1,
      orientationY: o.orientationY ?? 0,
      orientationZ: o.orientationZ ?? 0,
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
   * Audio graph with reverb (the mix of all sounds feeds the reverb):
   *   masterGain ─┬─ dryGain ──────────────────── output
   *               └─ reverbGain ── convolver ───── output
   *
   * With `distanceRolloff` set, each sound feeds the reverb through its own
   * send instead, before its PannerNode (see SoundSource.setPosition):
   *   masterGain ── dryGain ───────────────────────────── output
   *   reverbSendBus ── reverbGain ── convolver ─────────── output
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

      this.dryGain.connect(this.output);
      this.reverbGain.connect(this.convolver);
      this.convolver.connect(this.output);
    }

    // (Re)wire the reverb's input for the chosen mode.
    this.reverbDistanceRolloff = config.distanceRolloff ?? null;
    this.masterGain.disconnect();
    this.reverbSendBus.disconnect();
    this.masterGain.connect(this.dryGain!);
    if (this.reverbDistanceRolloff === null) {
      this.masterGain.connect(this.reverbGain!);
    } else {
      this.reverbSendBus.connect(this.reverbGain!);
    }

    this.convolver.buffer = config.customIR ?? this.generateIR(config);
    this.reverbGain!.gain.value = config.wet ?? 0.3;
    this.dryGain!.gain.value    = config.dry ?? 1.0;
  }

  disableReverb(): void {
    if (!this.convolver) return;

    this.masterGain.disconnect();
    this.reverbSendBus.disconnect();
    this.convolver.disconnect();
    this.reverbGain!.disconnect();
    this.dryGain!.disconnect();

    this.masterGain.connect(this.output);

    this.convolver  = null;
    this.reverbGain = null;
    this.dryGain    = null;
    this.reverbDistanceRolloff = null;
  }

  /**
   * Turns the output limiter on or off. When on, everything audible passes
   * through a DynamicsCompressorNode set as a limiter (ratio 20, hard knee)
   * before the destination, so sounds that add up past full scale are held
   * below it instead of clipping.
   *
   *   output ── compressor ── trim ── destination
   *
   * The compressor applies its own makeup gain, which would raise everything
   * below the threshold too; the trim GainNode takes it back out, so signals
   * below the threshold come out unchanged. The compressor's lookahead
   * delays the output by about 6 ms.
   */
  setLimiter(config: LimiterConfig): void {
    if (this.limiter) {
      this.output.disconnect();
      this.limiter.disconnect();
      this.limiterTrim!.disconnect();
      this.limiter = null;
      this.limiterTrim = null;
    }
    if (!config.enabled) {
      this.output.connect(this.audioContext.destination);
      return;
    }

    const threshold = config.threshold ?? LIMITER_THRESHOLD;
    const limiter = this.audioContext.createDynamicsCompressor();
    limiter.threshold.value = threshold;
    limiter.knee.value = 0;
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = LIMITER_ATTACK;
    limiter.release.value = LIMITER_RELEASE;
    // Web Audio's compressor boosts by 0.6 × the gain reduction it would
    // apply to a full-scale signal; undo exactly that.
    const makeupDb = 0.6 * -threshold * (1 - 1 / LIMITER_RATIO);
    const trim = this.audioContext.createGain();
    trim.gain.value = Math.pow(10, -makeupDb / 20);

    this.output.disconnect();
    this.output.connect(limiter);
    limiter.connect(trim);
    trim.connect(this.audioContext.destination);
    this.limiter = limiter;
    this.limiterTrim = trim;
  }

  /** ReverbConfig.distanceRolloff while distance-based reverb is on, else null. */
  getReverbDistanceRolloff(): number | null {
    return this.reverbDistanceRolloff;
  }

  setMasterVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.value = v;
    this.reverbSendBus.gain.value = v;
  }

  getMasterGain(): GainNode {
    return this.masterGain;
  }

  getReverbSendBus(): GainNode {
    return this.reverbSendBus;
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
