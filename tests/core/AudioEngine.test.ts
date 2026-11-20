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

    expect(master.connections).toEqual([ctx.destination]);
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
