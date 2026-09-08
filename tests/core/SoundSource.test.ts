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
    delayTime: { value: 0, maxValue: 5, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as DelayNode;
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
        createGainNode: () => gain,
        getMasterGain: () => gain,
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
        createGainNode: () => gain,
        getMasterGain: () => gain,
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
        createGainNode: () => gain,
        getMasterGain: () => gain,
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
        createGainNode: () => gain,
        getMasterGain: () => gain,
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
        createGainNode: () => gain,
        getMasterGain: () => gain,
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
        createPannerNode: () => panner,
        createDelayNode: () => delayNode,
        createGainNode: () => gain,
        getMasterGain: () => gain,
      } as unknown as AudioEngine;
    }

    it('sets delayTime directly when smoothing is 0 (snap)', () => {
      const delayNode = makeDelayNode();
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(0, delayNode), makeConfig());

      sound.setPropagationDelay(1.5);

      expect(delayNode.delayTime.value).toBe(1.5);
      expect(delayNode.delayTime.cancelScheduledValues).toHaveBeenCalled();
      expect(delayNode.delayTime.setTargetAtTime).not.toHaveBeenCalled();
      expect(sound.getPropagationDelay()).toBe(1.5);
    });

    it('ramps via setTargetAtTime when smoothing > 0', () => {
      const delayNode = makeDelayNode();
      const sound = new SoundSource('s', makeAudioBuffer(5), makeEngine(2, delayNode), makeConfig());

      sound.setPropagationDelay(0.8, 0.1);

      expect(delayNode.delayTime.setTargetAtTime).toHaveBeenCalledWith(0.8, 2, 0.1);
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
      const source = makeSource({ offset: 0 });
      const panner = { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as PannerNode;
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode;
      const engine = {
        getContext: () => ({ currentTime: 0, createBufferSource: () => source }),
        createPannerNode: () => panner,
        createDelayNode: () => delayNode,
        createGainNode: () => gain,
        getMasterGain: () => gain,
      } as unknown as AudioEngine;

      const sound = new SoundSource('s', makeAudioBuffer(5), engine, makeConfig());
      sound.play();

      expect(source.connect).toHaveBeenCalledWith(delayNode);
      expect(delayNode.connect).toHaveBeenCalledWith(panner);
    });
  });
});
