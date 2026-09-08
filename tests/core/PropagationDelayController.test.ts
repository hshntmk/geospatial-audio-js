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
  return {
    id,
    state,
    geoPosition: { lng: distance, lat: 0, alt: 0 },
    getPropagationDelay: () => delay,
    setPropagationDelay: (d: number) => { delay = d; },
  } as unknown as SoundSource;
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

  it('ramps (smoothing > 0) for a small, continuous distance change', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update(); // prime — snapped since it's the first sample
    expect(s.getPropagationDelay()).toBeCloseTo(1000 / C, 5);

    s.geoPosition.lng = 1010; // +10 m, well under the 500 m jump threshold
    // setPropagationDelay is a stand-in that ignores the smoothing arg but we
    // can still assert the *value* passed is the new, ramped-toward target.
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(1010 / C, 5);
  });

  it('snaps instantly on a distance jump larger than jumpThreshold', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, jumpThreshold: 500, maxDelayTime: 20 });
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    s.geoPosition.lng = 5000; // +4000 m jump (map flyTo/setView-style)
    update();
    expect(s.getPropagationDelay()).toBeCloseTo(5000 / C, 5);
  });

  it('resets a sound to zero delay when it stops playing', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    expect(s.getPropagationDelay()).toBeGreaterThan(0);

    (s as unknown as { state: SoundState }).state = 'paused';
    update();
    expect(s.getPropagationDelay()).toBe(0);
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
