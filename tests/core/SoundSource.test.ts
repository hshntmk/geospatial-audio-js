import { describe, it, expect, vi } from 'vitest';
import { SoundSource } from '../../src/core/SoundSource.js';
import type { AudioEngine } from '../../src/core/AudioEngine.js';
import type { SoundConfig } from '../../src/types/index.js';

function makeAudioBuffer(duration: number): AudioBuffer {
  return { duration, length: duration * 44100, sampleRate: 44100, numberOfChannels: 1 } as AudioBuffer;
}

function makeConfig(overrides?: Partial<SoundConfig>): SoundConfig {
  return {
    id: 'test',
    url: 'test.mp3',
    position: [0, 0, 0],
    loop: false,
    ...overrides,
  };
}

function makeSource(started: { offset: number }): AudioBufferSourceNode {
  const node = {
    buffer: null,
    loop: false,
    playbackRate: { value: 1, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn((_, off: number) => { started.offset = off; }),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  return node as unknown as AudioBufferSourceNode;
}

function makeDelayNode(): DelayNode {
  return {
    delayTime: {
      value: 0,
      maxValue: 5,
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as DelayNode;
}

function makeFilterNode(): BiquadFilterNode {
  return {
    frequency: { value: 20_000, minValue: 0, maxValue: 22_050, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    Q: { value: 0.707 },
    type: 'lowpass',
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as BiquadFilterNode;
}

describe('SoundSource', () => {
  describe('pause/resume offset', () => {
    it('resumes a non-looping sound at pauseOffset', () => {
      const started = { offset: 0 };
      let time = 0;
      const source = makeSource(started);
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: time, createBufferSource: () => source }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(10), engine, makeConfig({ loop: false }));
      sound.play();             // start at t=0
      time = 7;
      sound.pause();            // pauseOffset = 7
      sound.play();             // resume

      // For non-looping sound, offset passed directly without modulo
      expect(started.offset).toBe(7);
    });

    it('normalises pauseOffset with % buffer.duration for looping sounds', () => {
      const started = { offset: -1 };
      let time = 0;

      const bufferDuration = 4;

      // Each call to createBufferSource returns a fresh node so we can track
      // which start() call is the resume.
      const makeNodeFn = () => {
        const n = makeSource(started);
        return n;
      };

      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: time, createBufferSource: makeNodeFn }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(bufferDuration), engine, makeConfig({ loop: true }));
      sound.play();     // start at t=0
      time = 11;        // 11 s elapsed → 2 full loops + 3 s into 3rd loop
      sound.pause();    // pauseOffset = 11
      sound.play();     // resume — offset should be 11 % 4 = 3

      expect(started.offset).toBe(3);
    });

    it('offset 0 when resuming a sound paused at exactly buffer.duration boundary', () => {
      const started = { offset: -1 };
      let time = 0;
      const bufferDuration = 5;
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: time, createBufferSource: () => makeSource(started) }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(bufferDuration), engine, makeConfig({ loop: true }));
      sound.play();
      time = 10;        // exactly 2 loops → 10 % 5 = 0
      sound.pause();
      sound.play();

      expect(started.offset).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('play() is idempotent when already playing', () => {
      let startCallCount = 0;
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const node = {
        buffer: null, loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(() => { startCallCount++; }),
        stop: vi.fn(),
        onended: null,
      } as unknown as AudioBufferSourceNode;
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => node }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());
      sound.play();
      sound.play();
      expect(startCallCount).toBe(1);
    });

    it('emits playing / paused events', () => {
      const started = { offset: 0 };
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const node = makeSource(started);
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => node }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());
      const playingFn = vi.fn();
      const pausedFn = vi.fn();
      sound.on('playing', playingFn);
      sound.on('paused', pausedFn);

      sound.play();
      expect(playingFn).toHaveBeenCalledTimes(1);
      sound.pause();
      expect(pausedFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('propagation delay', () => {
    function makeEngine(currentTime: number, delayNode: DelayNode): AudioEngine {
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      return {
        getContext: () => ({ currentTime, createBufferSource: () => makeSource({ offset: 0 }) }),
        contextTimeAt: () => currentTime,
        createPannerNode: () => panner,
        createDelayNode: () => delayNode,
        createFilterNode: () => makeFilterNode(),
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;
    }

    it('sets delayTime directly when rampTime is 0 (snap)', () => {
      const delayNode = makeDelayNode();
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(0, delayNode), makeConfig());

      sound.setPropagationDelay(1.5);

      expect(delayNode.delayTime.value).toBe(1.5);
      expect(delayNode.delayTime.cancelScheduledValues).toHaveBeenCalled();
      expect(delayNode.delayTime.linearRampToValueAtTime).not.toHaveBeenCalled();
      expect(sound.getPropagationDelay()).toBe(1.5);
    });

    describe('ramping (rampTime > 0)', () => {
      // Ramps start DELAY_LOOKAHEAD (0.1 s) ahead of currentTime and chain end
      // to end, so audio the audio thread has already rendered is never rewritten.
      function setup() {
        const delayNode = makeDelayNode();
        const ctx = { currentTime: 2, createBufferSource: () => makeSource({ offset: 0 }) };
        const engine = {
          ...makeEngine(0, delayNode),
          getContext: () => ctx,
          // Map performance.now() ms straight to context seconds for the test.
          contextTimeAt: (ms: number) => ms / 1000,
        } as unknown as AudioEngine;
        const sound = new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());
        sound.setPropagationDelay(0.5); // snap at t = 2
        vi.mocked(delayNode.delayTime.cancelScheduledValues).mockClear();
        return { delayNode, ctx, sound };
      }

      it('holds the current value until the lookahead, then ramps linearly', () => {
        const { delayNode, sound } = setup();

        sound.setPropagationDelay(0.52, 0.1, 2000);

        expect(delayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(0.5, expect.closeTo(2.1, 10));
        expect(delayNode.delayTime.linearRampToValueAtTime).toHaveBeenCalledWith(0.52, expect.closeTo(2.2, 10));
        // An exponential approach would make the pitch warble (see setPropagationDelay).
        expect(delayNode.delayTime.setTargetAtTime).not.toHaveBeenCalled();
      });

      it('chains the next ramp onto the end of the previous one without cancelling it', () => {
        const { delayNode, ctx, sound } = setup();
        sound.setPropagationDelay(0.52, 0.1, 2000);
        vi.mocked(delayNode.delayTime.setValueAtTime).mockClear();

        ctx.currentTime = 2.1; // next update, on time
        sound.setPropagationDelay(0.54, 0.1, 2100);

        expect(delayNode.delayTime.cancelScheduledValues).not.toHaveBeenCalled();
        expect(delayNode.delayTime.setValueAtTime).not.toHaveBeenCalled();
        expect(delayNode.delayTime.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.54, expect.closeTo(2.3, 10));
      });

      it('holds the last ramp\'s end value when an update arrives after that ramp finished', () => {
        const { delayNode, ctx, sound } = setup();
        sound.setPropagationDelay(0.52, 0.1, 2000); // ends at 2.2

        ctx.currentTime = 2.5; // a late update
        sound.setPropagationDelay(0.56, 0.1, 2500);

        expect(delayNode.delayTime.setValueAtTime).toHaveBeenLastCalledWith(0.52, expect.closeTo(2.6, 10));
        expect(delayNode.delayTime.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.56, expect.closeTo(2.7, 10));
      });

      it('times the ramp by when the positions were set, not by when the update ran', () => {
        const { delayNode, ctx, sound } = setup();
        sound.setPropagationDelay(0.52, 0.1, 2000);

        // The update runs at 2.11 s, but the positions it read were set at 2.09 s.
        ctx.currentTime = 2.11;
        sound.setPropagationDelay(0.54, 0.1, 2090);

        expect(delayNode.delayTime.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.54, expect.closeTo(2.29, 10));
      });

      it('schedules nothing when the positions have not changed since the last ramp', () => {
        const { delayNode, ctx, sound } = setup();
        sound.setPropagationDelay(0.52, 0.1, 2000);

        ctx.currentTime = 2.1;
        sound.setPropagationDelay(0.52, 0.1, 2000); // same positions, same time

        expect(delayNode.delayTime.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
      });
    });

    it('clamps to the node capacity (maxValue) and rejects negative values', () => {
      const delayNode = makeDelayNode(); // maxValue: 5
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(0, delayNode), makeConfig());

      sound.setPropagationDelay(100);
      expect(sound.getPropagationDelay()).toBe(5);

      sound.setPropagationDelay(-1);
      expect(sound.getPropagationDelay()).toBe(0);
    });

    it('routes the buffer source through the delay node', () => {
      const delayNode = makeDelayNode();
      const filterNode = makeFilterNode();
      const source = makeSource({ offset: 0 });
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => source }),
        createPannerNode: () => panner,
        createDelayNode: () => delayNode,
        createFilterNode: () => filterNode,
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());
      sound.play();

      expect(source.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(filterNode);
      expect(filterNode.connect).toHaveBeenCalledWith(gain); // volume, then the panner
    });
  });

  describe('air absorption', () => {
    function makeEngine(currentTime: number, filterNode: BiquadFilterNode): AudioEngine {
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      return {
        getContext: () => ({ currentTime, createBufferSource: () => makeSource({ offset: 0 }) }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => filterNode,
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;
    }

    it('sets frequency directly when smoothing is 0 (snap)', () => {
      const filterNode = makeFilterNode();
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(0, filterNode), makeConfig());

      sound.setAirAbsorptionCutoff(1500);

      expect(filterNode.frequency.value).toBe(1500);
      expect(filterNode.frequency.cancelScheduledValues).toHaveBeenCalled();
      expect(filterNode.frequency.setTargetAtTime).not.toHaveBeenCalled();
      expect(sound.getAirAbsorptionCutoff()).toBe(1500);
    });

    it('ramps via setTargetAtTime when smoothing > 0', () => {
      const filterNode = makeFilterNode();
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(3, filterNode), makeConfig());

      sound.setAirAbsorptionCutoff(2000, 0.1);

      expect(filterNode.frequency.setTargetAtTime).toHaveBeenCalledWith(2000, 3, 0.1);
    });

    it('clamps to the node range (minValue/maxValue)', () => {
      const filterNode = makeFilterNode(); // minValue: 0, maxValue: 22050
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(0, filterNode), makeConfig());

      sound.setAirAbsorptionCutoff(100_000);
      expect(sound.getAirAbsorptionCutoff()).toBe(22_050);

      sound.setAirAbsorptionCutoff(-1);
      expect(sound.getAirAbsorptionCutoff()).toBe(0);
    });

    it('routes the delay node through the filter node and the volume into the panner', () => {
      const delayNode = makeDelayNode();
      const filterNode = makeFilterNode();
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => makeSource({ offset: 0 }) }),
        createPannerNode: () => panner,
        createDelayNode: () => delayNode,
        createFilterNode: () => filterNode,
        createGainNode: () => gain,
        getMasterGain: () => gain,
        getReverbSendBus: () => gain,
        getReverbDistanceRolloff: () => null,
      } as unknown as AudioEngine;

      new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());

      expect(delayNode.connect).toHaveBeenCalledWith(filterNode);
      expect(filterNode.connect).toHaveBeenCalledWith(gain); // volume
      expect(gain.connect).toHaveBeenCalledWith(panner);
    });
  });

  describe('distance-based reverb send', () => {
    function makeGain() {
      return {
        gain: { value: 1, setTargetAtTime: vi.fn(function (this: { value: number }, v: number) { this.value = v; }) },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }

    function setup(rolloff: number | null) {
      const panner = { refDistance: 10, positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      const gains = [makeGain(), makeGain()]; // volume, reverb send
      const master = makeGain(), sendBus = makeGain();
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => makeSource({ offset: 0 }) }),
        createPannerNode: () => panner,
        createDelayNode: () => makeDelayNode(),
        createFilterNode: () => makeFilterNode(),
        createGainNode: (initial = 1) => { const g = gains.shift()!; g.gain.value = initial; return g; },
        getMasterGain: () => master,
        getReverbSendBus: () => sendBus,
        getReverbDistanceRolloff: () => rolloff,
      };
      const [volume, send] = gains;
      const sound = new SoundSource('s', makeAudioBuffer(5), engine as unknown as AudioEngine, makeConfig());
      return { sound, panner, volume, send, sendBus };
    }

    it('taps the send after the volume, before the PannerNode, into the reverb send bus', () => {
      const { panner, volume, send, sendBus } = setup(0.5);
      expect(volume.connect).toHaveBeenCalledWith(panner);
      expect(volume.connect).toHaveBeenCalledWith(send);
      expect(send.connect).toHaveBeenCalledWith(sendBus);
      expect(send.gain.value).toBe(0); // silent until positioned
    });

    it('follows the inverse distance model with the reverb\'s own rolloff', () => {
      const { sound, send } = setup(0.5);

      sound.setPosition({ x: 6, y: 0, z: -8 }); // 10 m = refDistance
      expect(send.gain.value).toBeCloseTo(1, 10);

      sound.setPosition({ x: 50, y: 0, z: 0 }); // 10 / (10 + 0.5 × 40)
      expect(send.gain.value).toBeCloseTo(1 / 3, 10);
      expect(sound.getReverbSendLevel()).toBeCloseTo(1 / 3, 10);
    });

    it('keeps the reverb level constant with rolloff 0', () => {
      const { sound, send } = setup(0);
      sound.setPosition({ x: 1000, y: 0, z: 0 });
      expect(send.gain.value).toBe(1);
    });

    it('sends nothing when distance-based reverb is off', () => {
      const { sound, send } = setup(null);
      sound.setPosition({ x: 50, y: 0, z: 0 });
      expect(send.gain.value).toBe(0);
      expect(send.gain.setTargetAtTime).not.toHaveBeenCalled();
    });
  });
});
