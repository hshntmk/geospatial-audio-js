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
