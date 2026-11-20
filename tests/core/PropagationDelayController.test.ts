import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PropagationDelayController } from '../../src/core/PropagationDelayController.js';
import type { SoundManager } from '../../src/core/SoundManager.js';
import type { ListenerManager } from '../../src/core/ListenerManager.js';
import type { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';
import type { SoundSource } from '../../src/core/SoundSource.js';
import type { SoundState } from '../../src/types/index.js';

/** Minimal SoundSource stand-in. Distance is taken from geoPosition.lng. */
function makeSound(id: string, distance: number, state: SoundState = 'playing') {
  let delay = 0;
  let rampTime = 0;
  return {
    id,
    state,
    geoPosition: { lng: distance, lat: 0, alt: 0 },
    geoPositionTime: 0,
    getPropagationDelay: () => delay,
    setPropagationDelay: (d: number, ramp = 0) => { delay = d; rampTime = ramp; },
    /** Ramp time passed with the last setPropagationDelay call (0 = snap). */
    lastRampTime: () => rampTime,
  } as unknown as SoundSource & { lastRampTime(): number };
}

const C = 343.3;

describe('PropagationDelayController', () => {
  let sounds: ReturnType<typeof makeSound>[];
  let controller: PropagationDelayController;
  let listenerPos: { lng: number; lat: number; alt: number };

  function update() {
    // Drive the private tick directly for deterministic timing.
    (controller as unknown as { update(): void }).update();
  }

  beforeEach(() => {
    sounds = [];
    listenerPos = { lng: 0, lat: 0, alt: 0 };

    const soundManager = { getAllSounds: () => sounds } as unknown as SoundManager;
    const listenerManager = {
      getCurrentPosition: () => listenerPos,
      getPositionTime: () => 0,
    } as unknown as ListenerManager;
    const converter = {
      // distance encoded as geoPosition.lng relative to listener at lng 0
      calculateDistance: (a: { lng: number }, b: { lng: number }) => Math.abs(b.lng - a.lng),
    } as unknown as CoordinateConverter;

    controller = new PropagationDelayController(soundManager, listenerManager, converter);
    // Large interval so the internal setInterval never auto-fires during a test.
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, jumpThreshold: 500 });
  });

  afterEach(() => {
    controller.dispose();
    vi.restoreAllMocks();
  });

  it('sets delay = distance / speedOfSound on the first sample', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(1000 / C, 5);
  });

  it('clamps delay to maxDelayTime for far sounds', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, maxDelayTime: 2 });
    const s = makeSound('a', 100_000); // would be ~291 s
    sounds.push(s);
    update();
    expect(s.getPropagationDelay()).toBe(2);
  });

  it('ramps over one update interval for a small, continuous distance change', () => {
    controller.setConfig({ enabled: true, updateInterval: 100 });
    controller.stop(); // drive ticks by hand
    const s = makeSound('a', 1000);
    sounds.push(s);
    update(); // prime — snapped since it's the first sample
    expect(s.getPropagationDelay()).toBeCloseTo(1000 / C, 5);
    expect(s.lastRampTime()).toBe(0);

    s.geoPosition.lng = 1010; // +10 m, well under the 500 m jump threshold
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(1010 / C, 5);
    expect(s.lastRampTime()).toBeCloseTo(0.1, 10);
  });

  it('snaps instantly on a distance jump larger than jumpThreshold', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, jumpThreshold: 500, maxDelayTime: 20 });
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    s.geoPosition.lng = 5000; // +4000 m jump (map flyTo/setView-style)
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(5000 / C, 5);
    expect(s.lastRampTime()).toBe(0);
  });

  describe('getRateFactor', () => {
    it('is 1 − (change in delay) / dt for continuous motion', () => {
      // Receding at C / 10 m/s: the delay grows 0.1 s per second.
      expect(controller.getRateFactor(1000, 1000 + C / 10, 1)).toBeCloseTo(0.9, 10);
      // Approaching at the same speed.
      expect(controller.getRateFactor(1000, 1000 - C / 10, 1)).toBeCloseTo(1.1, 10);
    });

    it('is 1 across a jump, which is snapped rather than ramped', () => {
      expect(controller.getRateFactor(1000, 5000, 0.1)).toBe(1);
    });

    it('is 1 once the delay is pinned at maxDelayTime', () => {
      controller.setConfig({ enabled: true, updateInterval: 1_000_000, maxDelayTime: 1 });
      expect(controller.getRateFactor(2 * C, 2 * C + 100, 1)).toBe(1);
    });

    it('is 1 when propagation delay is disabled', () => {
      controller.setConfig({ enabled: false });
      expect(controller.getRateFactor(1000, 1100, 1)).toBe(1);
    });
  });

  it('leaves a sound\'s delay untouched when it stops playing (does not truncate the draining tail)', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    const delayWhilePlaying = s.getPropagationDelay();
    expect(delayWhilePlaying).toBeGreaterThan(0);

    (s as unknown as { state: SoundState }).state = 'paused';
    update();
    // Must NOT be forced to 0 — that would yank the DelayNode's read position
    // forward and truncate/garble audio still draining out of it.
    expect(s.getPropagationDelay()).toBe(delayWhilePlaying);
  });

  it('snaps fresh (not stale) when a sound starts playing again after stopping', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    (s as unknown as { state: SoundState }).state = 'paused';
    update(); // forgets the distance sample, delay left as-is

    (s as unknown as { state: SoundState }).state = 'playing';
    s.geoPosition.lng = 1500; // moved while paused, still under the default 5s maxDelayTime cap
    update();
    // No prev sample after replay → snaps directly to the new distance,
    // rather than ramping from the old (now stale) value.
    expect(s.getPropagationDelay()).toBeCloseTo(1500 / C, 5);
  });

  it('restores all delays to zero when disabled', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    expect(s.getPropagationDelay()).toBeGreaterThan(0);

    controller.setConfig({ enabled: false });
    expect(s.getPropagationDelay()).toBe(0);
  });

  it('scales delay with a custom speedOfSound', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, speedOfSound: 340 });
    const s = makeSound('a', 340);
    sounds.push(s);
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(1, 5);
  });
});
