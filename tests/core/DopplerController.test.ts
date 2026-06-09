import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DopplerController } from '../../src/core/DopplerController.js';
import type { SoundManager } from '../../src/core/SoundManager.js';
import type { ListenerManager } from '../../src/core/ListenerManager.js';
import type { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';
import type { SoundSource } from '../../src/core/SoundSource.js';
import type { SoundState } from '../../src/types/index.js';

/** Minimal SoundSource stand-in. Distance is taken from geoPosition.lng. */
function makeSound(id: string, distance: number, state: SoundState = 'playing') {
  let rate = 1;
  return {
    id,
    state,
    geoPosition: { lng: distance, lat: 0, alt: 0 },
    getPlaybackRate: () => rate,
    setPlaybackRate: (r: number) => { rate = r; },
  } as unknown as SoundSource & { setRateSpy?: unknown };
}

const C = 343.3;

describe('DopplerController', () => {
  let sounds: ReturnType<typeof makeSound>[];
  let controller: DopplerController;
  let now: number;
  let listenerPos: { lng: number; lat: number; alt: number };

  function update() {
    // Drive the private tick directly for deterministic timing.
    (controller as unknown as { update(): void }).update();
  }

  beforeEach(() => {
    sounds = [];
    now = 0;
    listenerPos = { lng: 0, lat: 0, alt: 0 };
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const soundManager = { getAllSounds: () => sounds } as unknown as SoundManager;
    const listenerManager = {
      getCurrentPosition: () => listenerPos,
    } as unknown as ListenerManager;
    const converter = {
      // distance encoded as geoPosition.lng relative to listener at lng 0
      calculateDistance: (a: { lng: number }, b: { lng: number }) => Math.abs(b.lng - a.lng),
    } as unknown as CoordinateConverter;

    controller = new DopplerController(soundManager, listenerManager, converter);
    // Large interval so the internal setInterval never auto-fires during a test.
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, smoothing: 0 });
  });

  afterEach(() => {
    controller.dispose();
    vi.restoreAllMocks();
  });

  it('leaves pitch unchanged on the first sample (no velocity yet)', () => {
    const s = makeSound('a', 100);
    sounds.push(s);
    update();
    expect(s.getPlaybackRate()).toBe(1);
  });

  it('lowers pitch for a receding source', () => {
    const s = makeSound('a', 100);
    sounds.push(s);
    update();            // prime
    now = 1000;          // +1 s
    s.geoPosition.lng = 200; // moved 100 m away → +100 m/s
    update();
    // ratio = C / (C + 100) < 1
    expect(s.getPlaybackRate()).toBeCloseTo(C / (C + 100), 5);
    expect(s.getPlaybackRate()).toBeLessThan(1);
  });

  it('raises pitch for an approaching source', () => {
    const s = makeSound('a', 200);
    sounds.push(s);
    update();
    now = 1000;
    s.geoPosition.lng = 100; // moved 100 m closer → -100 m/s
    update();
    expect(s.getPlaybackRate()).toBeCloseTo(C / (C - 100), 5);
    expect(s.getPlaybackRate()).toBeGreaterThan(1);
  });

  it('clamps extreme shifts to maxPitchRatio bounds', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, smoothing: 0, maxPitchRatio: 2 });
    const s = makeSound('a', 0);
    sounds.push(s);
    update();
    now = 1000;
    s.geoPosition.lng = 100_000; // absurd recession → ratio would be ~0
    update();
    expect(s.getPlaybackRate()).toBeCloseTo(0.5, 5); // 1 / maxPitchRatio
  });

  it('scales the effect with dopplerFactor', () => {
    controller.setConfig({ enabled: true, updateInterval: 1_000_000, smoothing: 0, dopplerFactor: 2 });
    const s = makeSound('a', 100);
    sounds.push(s);
    update();
    now = 1000;
    s.geoPosition.lng = 200; // +100 m/s
    update();
    expect(s.getPlaybackRate()).toBeCloseTo(C / (C + 2 * 100), 5);
  });

  it('resets a sound to neutral pitch when it stops playing', () => {
    const s = makeSound('a', 100);
    sounds.push(s);
    update();
    now = 1000;
    s.geoPosition.lng = 200;
    update();
    expect(s.getPlaybackRate()).toBeLessThan(1);

    (s as unknown as { state: SoundState }).state = 'paused';
    update();
    expect(s.getPlaybackRate()).toBe(1);
  });

  describe('listenerMotion: false (source motion only)', () => {
    const k = (Math.PI / 180) * 6_371_000; // metres per degree

    it('still shifts pitch for a source moving along the line of sight', () => {
      controller.setConfig({ enabled: true, updateInterval: 1_000_000, smoothing: 0, listenerMotion: false });
      // Source due east of the listener (at lng 0), moving further east → receding.
      const s = makeSound('a', 0.001);
      sounds.push(s);
      update();
      now = 1000;
      s.geoPosition.lng = 0.002; // moved ~111 m east in 1 s
      update();
      const expected = 343.3 / (343.3 + k * 0.001); // radial ≈ +111 m/s
      expect(s.getPlaybackRate()).toBeCloseTo(expected, 2);
      expect(s.getPlaybackRate()).toBeLessThan(1);
    });

    it('does NOT shift pitch when only the listener moves', () => {
      controller.setConfig({ enabled: true, updateInterval: 1_000_000, smoothing: 0, listenerMotion: false });
      const s = makeSound('a', 0.001); // source stays put
      sounds.push(s);
      update();
      now = 1000;
      listenerPos.lng = -0.001; // listener moves away; source unchanged
      update();
      expect(s.getPlaybackRate()).toBe(1);
    });

    it('DOES shift pitch from listener motion when listenerMotion is true', () => {
      // Contrast: in the default mode, listener-only movement still shifts pitch.
      // Fake converter distance = |geo.lng - listener.lng|.
      const s = makeSound('a', 100); // source fixed at lng 100
      sounds.push(s);
      update();
      now = 1000;
      listenerPos.lng = -150; // listener moves away → distance 100 → 250 (receding)
      update();
      expect(s.getPlaybackRate()).toBeLessThan(1);
    });
  });

  it('restores all pitches to 1 when disabled', () => {
    const s = makeSound('a', 100);
    sounds.push(s);
    update();
    now = 1000;
    s.geoPosition.lng = 200;
    update();
    expect(s.getPlaybackRate()).toBeLessThan(1);

    controller.setConfig({ enabled: false });
    expect(s.getPlaybackRate()).toBe(1);
  });
});
