import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebugHelper } from '../../src/core/DebugHelper.js';
import type { SoundManager } from '../../src/core/SoundManager.js';
import type { ListenerManager } from '../../src/core/ListenerManager.js';
import type { AudioEngine } from '../../src/core/AudioEngine.js';
import type { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';

function makeDeps() {
  const mockSound = {
    id: 'test-sound',
    state: 'playing' as const,
    geoPosition: { lng: 139.69, lat: 35.69, alt: 0 },
    audioPosition: { x: 10, y: 0, z: -5 },
    getVolume: () => 0.8,
  };

  const soundManager = {
    getAllSounds: () => [mockSound],
    getSound: (id: string) => (id === 'test-sound' ? mockSound : undefined),
  } as unknown as SoundManager;

  const listenerManager = {
    getCurrentPosition: () => ({ lng: 139.69, lat: 35.69, alt: 0 }),
  } as unknown as ListenerManager;

  const audioEngine = {
    getContext: () => ({
      state: 'running',
      sampleRate: 48000,
      currentTime: 1.5,
    }),
  } as unknown as AudioEngine;

  const coordinateConverter = {
    calculateDistance: vi.fn(() => 42),
  } as unknown as CoordinateConverter;

  return { soundManager, listenerManager, audioEngine, coordinateConverter };
}

describe('DebugHelper', () => {
  let helper: DebugHelper;

  beforeEach(() => {
    const deps = makeDeps();
    helper = new DebugHelper(
      deps.soundManager,
      deps.listenerManager,
      deps.audioEngine,
      deps.coordinateConverter,
    );
  });

  describe('getDebugInfo()', () => {
    it('returns correct sound counts', () => {
      const info = helper.getDebugInfo();
      expect(info.totalSounds).toBe(1);
      expect(info.activeSounds).toBe(1);
      expect(info.culledSounds).toBe(0);
    });

    it('includes audioContext state', () => {
      const info = helper.getDebugInfo();
      expect(info.audioContext.state).toBe('running');
      expect(info.audioContext.sampleRate).toBe(48000);
      expect(info.audioContext.currentTime).toBe(1.5);
    });

    it('includes per-sound debug info', () => {
      const info = helper.getDebugInfo();
      expect(info.sounds).toHaveLength(1);
      const s = info.sounds[0];
      expect(s.id).toBe('test-sound');
      expect(s.state).toBe('playing');
      expect(s.volume).toBe(0.8);
      expect(s.distanceFromListener).toBe(42);
    });

    it('reports culledSounds from paused state', () => {
      const deps = makeDeps();
      const pausedSound = { ...deps.soundManager.getAllSounds()[0], state: 'paused' as const };
      // Override after capturing the original value
      (deps.soundManager as unknown as { getAllSounds: () => unknown[] }).getAllSounds =
        vi.fn(() => [pausedSound]);
      const h = new DebugHelper(
        deps.soundManager,
        deps.listenerManager,
        deps.audioEngine,
        deps.coordinateConverter,
      );
      const info = h.getDebugInfo();
      expect(info.activeSounds).toBe(0);
      expect(info.culledSounds).toBe(1);
    });
  });

  describe('enable() / disable()', () => {
    it('enable() sets logAudioParams config', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      helper.enable({ logAudioParams: true });
      // logSoundParams should now log (we verify no throw)
      expect(() => helper.logSoundParams('test-sound')).not.toThrow();
      consoleSpy.mockRestore();
    });

    it('logSoundParams() is silent when logAudioParams is false', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      helper.logSoundParams('test-sound'); // disabled by default
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('disable() prevents logSoundParams from logging', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      helper.enable({ logAudioParams: true });
      helper.disable();
      // After disable, logAudioParams is false → logSoundParams should be silent
      consoleSpy.mockClear();
      helper.logSoundParams('test-sound');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
