import { describe, it, expect, vi } from 'vitest';
import { PerformanceOptimizer } from '../../src/core/PerformanceOptimizer.js';
import type { SoundManager } from '../../src/core/SoundManager.js';
import type { ListenerManager } from '../../src/core/ListenerManager.js';
import type { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';
import { EventEmitter } from '../../src/utils/EventEmitter.js';

/**
 * Mock sound whose distance from the listener is simply |lng| in metres
 * (see the CoordinateConverter mock below).
 */
function makeSound(id: string, distance: number, state = 'playing') {
  const sound = {
    id,
    state,
    geoPosition: { lng: distance, lat: 0, alt: 0 },
    config: { id, position: [distance, 0] as [number, number], url: '' },
    pause: vi.fn(() => { sound.state = 'paused'; }),
    play:  vi.fn(() => { sound.state = 'playing'; }),
  };
  return sound;
}

type MockSound = ReturnType<typeof makeSound>;

function makeOptimizer(sounds: MockSound[]) {
  const soundManager = {
    getAllSounds: () => sounds,
    getSound: (id: string) => sounds.find(s => s.id === id),
  } as unknown as SoundManager;

  const listenerManager = {
    getCurrentPosition: () => ({ lng: 0, lat: 0, alt: 0 }),
  } as unknown as ListenerManager;

  const coordinateConverter = {
    calculateDistance: (_listener: unknown, geo: { lng: number }) => Math.abs(geo.lng),
  } as unknown as CoordinateConverter;

  const emitter = new EventEmitter();
  const optimizer = new PerformanceOptimizer(
    soundManager, listenerManager, coordinateConverter, emitter,
  );
  // Drive ticks directly instead of via setInterval
  const tick = () => (optimizer as unknown as { update(): void }).update();
  return { optimizer, emitter, tick };
}

describe('PerformanceOptimizer', () => {
  describe('distance culling', () => {
    it('pauses sounds beyond cullingDistance and resumes them in range', () => {
      const sound = makeSound('far', 6000); // > default 5000
      const { emitter, tick } = makeOptimizer([sound]);
      const culled = vi.fn();
      const unculled = vi.fn();
      emitter.on('soundCulled', culled);
      emitter.on('soundUnculled', unculled);

      tick();
      expect(sound.pause).toHaveBeenCalledTimes(1);
      expect(culled).toHaveBeenCalledWith('far');

      sound.geoPosition.lng = 100; // back in range
      tick();
      expect(sound.play).toHaveBeenCalledTimes(1);
      expect(unculled).toHaveBeenCalledWith('far');
    });

    it('respects per-sound config.maxDistance over cullingDistance', () => {
      const sound = makeSound('near-limit', 150);
      (sound.config as { maxDistance?: number }).maxDistance = 100;
      const { tick } = makeOptimizer([sound]);

      tick();
      expect(sound.pause).toHaveBeenCalledTimes(1);
    });

    it('does not resume sounds the user paused manually', () => {
      const sound = makeSound('manual', 100, 'paused');
      const { tick } = makeOptimizer([sound]);

      tick();
      expect(sound.play).not.toHaveBeenCalled();
    });
  });

  describe('max active sounds', () => {
    it('pauses the farthest sounds over the limit without flapping', () => {
      const near = makeSound('near', 10);
      const far  = makeSound('far', 20);
      const { optimizer, tick } = makeOptimizer([near, far]);
      optimizer.setConfig({ maxActiveSounds: 1 });

      tick();
      expect(far.pause).toHaveBeenCalledTimes(1);
      expect(near.pause).not.toHaveBeenCalled();

      // Regression (A-3): distance culling must not resume a limit-paused
      // sound on later ticks — that caused a 100 ms pause/play oscillation.
      tick();
      tick();
      tick();
      expect(far.play).not.toHaveBeenCalled();
      expect(far.pause).toHaveBeenCalledTimes(1);
      expect(far.state).toBe('paused');
    });

    it('resumes the closest limit-paused sound when a slot frees up', () => {
      const near = makeSound('near', 10);
      const mid  = makeSound('mid', 20);
      const far  = makeSound('far', 30);
      const { optimizer, emitter, tick } = makeOptimizer([near, mid, far]);
      optimizer.setConfig({ maxActiveSounds: 1 });
      const unculled = vi.fn();
      emitter.on('soundUnculled', unculled);

      tick(); // mid and far get paused
      expect(mid.state).toBe('paused');
      expect(far.state).toBe('paused');

      near.state = 'stopped'; // a slot frees up
      tick();
      expect(mid.play).toHaveBeenCalledTimes(1); // closest first
      expect(far.play).not.toHaveBeenCalled();
      expect(unculled).toHaveBeenCalledWith('mid');
    });

    it('does not resume a limit-paused sound that is now out of range', () => {
      const near = makeSound('near', 10);
      const far  = makeSound('far', 20);
      const { optimizer, tick } = makeOptimizer([near, far]);
      optimizer.setConfig({ maxActiveSounds: 1 });

      tick(); // far gets limit-paused
      far.geoPosition.lng = 6000; // drifts out of range while paused
      near.state = 'stopped';     // slot frees up
      tick();
      expect(far.play).not.toHaveBeenCalled();
    });
  });
});
