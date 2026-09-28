import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AirAbsorptionController } from '../../src/core/AirAbsorptionController.js';
import type { SoundManager } from '../../src/core/SoundManager.js';
import type { ListenerManager } from '../../src/core/ListenerManager.js';
import type { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';
import type { SoundSource } from '../../src/core/SoundSource.js';
import type { SoundState } from '../../src/types/index.js';

/** Minimal SoundSource stand-in. Distance is taken from geoPosition.lng. */
function makeSound(id: string, distance: number, state: SoundState = 'playing') {
  let cutoff = 20_000;
  return {
    id,
    state,
    geoPosition: { lng: distance, lat: 0, alt: 0 },
    getAirAbsorptionCutoff: () => cutoff,
    setAirAbsorptionCutoff: (f: number) => { cutoff = f; },
  } as unknown as SoundSource;
}

describe('AirAbsorptionController', () => {
  let sounds: ReturnType<typeof makeSound>[];
  let controller: AirAbsorptionController;
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

    controller = new AirAbsorptionController(soundManager, listenerManager, converter);
    // Large interval so the internal setInterval never auto-fires during a test.
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, jumpThreshold: 500 });
  });

  afterEach(() => {
    controller.dispose();
    vi.restoreAllMocks();
  });

  it('is fully open (maxCutoffFrequency) at distance 0', () => {
    const s = makeSound('a', 0);
    sounds.push(s);
    update();
    expect(s.getAirAbsorptionCutoff()).toBeCloseTo(20_000, 5);
  });

  it('decays exponentially toward minCutoffFrequency with distance', () => {
    controller.setConfig({
      enabled: true, updateInterval: 1_000_000, jumpThreshold: 500,
      maxCutoffFrequency: 20_000, minCutoffFrequency: 1_000, falloffDistance: 500,
    });
    const s = makeSound('a', 500); // one falloffDistance away
    sounds.push(s);
    update();
    const expected = 1_000 + (20_000 - 1_000) * Math.exp(-1);
    expect(s.getAirAbsorptionCutoff()).toBeCloseTo(expected, 5);
  });

  it('approaches but never drops below minCutoffFrequency for very far sounds', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, minCutoffFrequency: 1_000, falloffDistance: 500 });
    const s = makeSound('a', 10_000); // 20 falloffDistances away — exp(-20) is tiny but not exactly 0
    sounds.push(s);
    update();
    expect(s.getAirAbsorptionCutoff()).toBeCloseTo(1_000, 3);
    expect(s.getAirAbsorptionCutoff()).toBeGreaterThan(1_000);
  });

  it('leaves a sound\'s cutoff untouched when it stops playing (does not un-muffle a draining tail)', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    const cutoffWhilePlaying = s.getAirAbsorptionCutoff();
    expect(cutoffWhilePlaying).toBeLessThan(20_000);

    (s as unknown as { state: SoundState }).state = 'paused';
    update();
    // Must NOT snap back to wide open — delayed audio may still be draining
    // through this filter (see PropagationDelayController) and should keep
    // the muffling that matched its actual distance.
    expect(s.getAirAbsorptionCutoff()).toBe(cutoffWhilePlaying);
  });

  it('snaps fresh (not stale) when a sound starts playing again after stopping', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    (s as unknown as { state: SoundState }).state = 'paused';
    update(); // forgets the distance sample, cutoff left as-is

    (s as unknown as { state: SoundState }).state = 'playing';
    s.geoPosition.lng = 0; // moved right next to the listener while paused
    update();
    // No prev sample after replay → snaps directly to the new distance's
    // cutoff, rather than ramping from the old (now stale) value.
    expect(s.getAirAbsorptionCutoff()).toBeCloseTo(20_000, 5);
  });

  it('restores all cutoffs to maxCutoffFrequency when disabled', () => {
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();
    expect(s.getAirAbsorptionCutoff()).toBeLessThan(20_000);

    controller.setConfig({ enabled: false });
    expect(s.getAirAbsorptionCutoff()).toBe(20_000);
  });

  it('uses a custom maxCutoffFrequency as the disabled/reset value', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, maxCutoffFrequency: 15_000 });
    const s = makeSound('a', 1000);
    sounds.push(s);
    update();

    controller.setConfig({ enabled: false });
    expect(s.getAirAbsorptionCutoff()).toBe(15_000);
  });
});
