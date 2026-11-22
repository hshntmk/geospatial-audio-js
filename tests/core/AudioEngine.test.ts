import { describe, it, expect, vi, afterEach } from 'vitest';
import { AudioEngine } from '../../src/core/AudioEngine.js';

describe('AudioEngine.contextTimeAt', () => {
  let perfNow = 0;

  function setup() {
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow);
    const engine = new AudioEngine();
    const ctx = engine.getContext() as unknown as { currentTime: number };
    return { engine, ctx };
  }

  afterEach(() => vi.restoreAllMocks());

  it('maps performance time onto the currentTime timeline', () => {
    const { engine, ctx } = setup();
    perfNow = 10_000;
    ctx.currentTime = 3;
    // offset = 3 − 10 = −7 s
    expect(engine.contextTimeAt(10_050)).toBeCloseTo(3.05, 10);
  });

  it('ignores the lag while currentTime has not stepped yet (keeps the peak offset)', () => {
    const { engine, ctx } = setup();
    perfNow = 10_000;
    ctx.currentTime = 3;
    engine.contextTimeAt(perfNow);

    // 4 ms later, currentTime still shows the last audio callback's value.
    perfNow = 10_004;
    expect(engine.contextTimeAt(10_004)).toBeCloseTo(3.004, 5);
  });

  it('starts over when the offset drops sharply (context was suspended)', () => {
    const { engine, ctx } = setup();
    perfNow = 10_000;
    ctx.currentTime = 3;
    engine.contextTimeAt(perfNow);

    // 2 s pass with currentTime frozen at 3.
    perfNow = 12_000;
    expect(engine.contextTimeAt(12_000)).toBeCloseTo(3, 10);
  });
});

describe('AudioEngine reverb wiring', () => {
  type Node = { connections: unknown[]; gain?: { value: number } };

  function setup() {
    const engine = new AudioEngine();
    const ctx = engine.getContext() as unknown as { destination: unknown };
    const master = engine.getMasterGain() as unknown as Node;
    const sendBus = engine.getReverbSendBus() as unknown as Node;
    return { engine, ctx, master, sendBus };
  }

  it('feeds the mix of all sounds into the reverb when distanceRolloff is omitted', () => {
    const { engine, master, sendBus } = setup();
    engine.setReverb({ enabled: true, type: 'room' });

    expect(master.connections).toHaveLength(2); // dryGain and reverbGain
    expect(sendBus.connections).toHaveLength(0);
    expect(engine.getReverbDistanceRolloff()).toBeNull();
  });

  it('feeds the reverb from the per-sound send bus when distanceRolloff is set', () => {
    const { engine, master, sendBus } = setup();
    engine.setReverb({ enabled: true, type: 'room', distanceRolloff: 0.3 });

    expect(master.connections).toHaveLength(1); // dryGain only
    expect(sendBus.connections).toHaveLength(1); // reverbGain
    expect(engine.getReverbDistanceRolloff()).toBe(0.3);
  });

  it('rewires when switching between the two modes', () => {
    const { engine, master, sendBus } = setup();
    engine.setReverb({ enabled: true, distanceRolloff: 0.3 });
    engine.setReverb({ enabled: true });

    expect(master.connections).toHaveLength(2);
    expect(sendBus.connections).toHaveLength(0);
  });

  it('restores the plain graph and turns distance mode off when disabled', () => {
    const { engine, ctx, master, sendBus } = setup();
    engine.setReverb({ enabled: true, distanceRolloff: 0.3 });
    engine.disableReverb();

    // masterGain → output → destination
    expect(master.connections).toHaveLength(1);
    expect((master.connections[0] as Node).connections).toEqual([ctx.destination]);
    expect(sendBus.connections).toHaveLength(0);
    expect(engine.getReverbDistanceRolloff()).toBeNull();
  });

  it('applies the master volume to the reverb sends too', () => {
    const { engine, master, sendBus } = setup();
    engine.setMasterVolume(0.4);
    expect(master.gain!.value).toBe(0.4);
    expect(sendBus.gain!.value).toBe(0.4);
  });
});

describe('AudioEngine.createPannerNode', () => {
  // tests/setup.ts defines PannerNode as writable but not configurable, so
  // swap it by assignment rather than vi.stubGlobal.
  const win = window as unknown as { PannerNode: unknown };
  const original = win.PannerNode;
  let received: PannerOptions | undefined;

  function setup() {
    received = undefined;
    win.PannerNode = class {
      constructor(_ctx: unknown, options: PannerOptions) { received = options; }
    };
    return new AudioEngine();
  }

  afterEach(() => { win.PannerNode = original; });

  it('passes the sound\'s orientation to the PannerNode', () => {
    const engine = setup();
    engine.createPannerNode({ coneInnerAngle: 60, coneOuterAngle: 120, orientationX: 0, orientationY: 0, orientationZ: -1 });

    expect(received).toMatchObject({
      coneInnerAngle: 60,
      coneOuterAngle: 120,
      orientationX: 0,
      orientationY: 0,
      orientationZ: -1,
    });
  });

  it('uses Web Audio\'s cone defaults when none are given, so a narrowed inner cone fades out towards the back', () => {
    const engine = setup();
    engine.createPannerNode({ coneInnerAngle: 60 });

    expect(received).toMatchObject({ coneInnerAngle: 60, coneOuterAngle: 360, coneOuterGain: 0 });
  });

  it('keeps PannerNode\'s default orientation (1, 0, 0) when none is given', () => {
    const engine = setup();
    engine.createPannerNode();

    expect(received).toMatchObject({ orientationX: 1, orientationY: 0, orientationZ: 0 });
  });
});

describe('AudioEngine.setLimiter', () => {
  type Param = { value: number };
  type Node = { connections: Node[]; gain?: Param; threshold?: Param; knee?: Param; ratio?: Param };

  function setup() {
    const engine = new AudioEngine();
    const ctx = engine.getContext() as unknown as { destination: Node };
    // masterGain feeds the output node, the last stop before the destination.
    const output = (engine.getMasterGain() as unknown as Node).connections[0];
    return { engine, ctx, output };
  }

  it('is off by default: the output goes straight to the destination', () => {
    const { ctx, output } = setup();
    expect(output.connections).toEqual([ctx.destination]);
  });

  it('inserts compressor → trim before the destination when enabled', () => {
    const { engine, ctx, output } = setup();
    engine.setLimiter({ enabled: true });

    const [compressor] = output.connections;
    const [trim] = compressor.connections;
    expect(output.connections).toHaveLength(1);
    expect(compressor.threshold!.value).toBe(-3);
    expect(compressor.knee!.value).toBe(0);
    expect(compressor.ratio!.value).toBe(20);
    expect(trim.connections).toEqual([ctx.destination]);
    // Cancels the compressor's makeup gain: 0.6 × 3 dB × (1 − 1/20) = 1.71 dB
    expect(trim.gain!.value).toBeCloseTo(Math.pow(10, -1.71 / 20), 6);
  });

  it('scales the makeup-gain correction with a custom threshold', () => {
    const { engine, output } = setup();
    engine.setLimiter({ enabled: true, threshold: -6 });

    const [compressor] = output.connections;
    expect(compressor.threshold!.value).toBe(-6);
    expect(compressor.connections[0].gain!.value).toBeCloseTo(Math.pow(10, -3.42 / 20), 6);
  });

  it('replaces rather than stacks the limiter when enabled twice, and removes it when disabled', () => {
    const { engine, ctx, output } = setup();
    engine.setLimiter({ enabled: true });
    engine.setLimiter({ enabled: true, threshold: -6 });
    expect(output.connections).toHaveLength(1);

    engine.setLimiter({ enabled: false });
    expect(output.connections).toEqual([ctx.destination]);
  });
});
