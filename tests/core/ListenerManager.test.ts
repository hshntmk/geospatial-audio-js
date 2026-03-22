import { describe, it, expect, vi } from 'vitest';
import { ListenerManager } from '../../src/core/ListenerManager.js';
import type { AudioEngine } from '../../src/core/AudioEngine.js';
import type { MapAdapter } from '../../src/adapters/MapAdapter.js';
import { EventEmitter } from '../../src/utils/EventEmitter.js';

function makeMockAudioEngine(): AudioEngine {
  return {
    setListenerPosition: vi.fn(),
    setListenerOrientation: vi.fn(),
  } as unknown as AudioEngine;
}

function makeMockMapAdapter(overrides?: Partial<MapAdapter>): MapAdapter {
  return {
    getCenter: () => ({ lng: 139.69, lat: 35.69, alt: 0 }),
    getBearing: () => 0,
    getPitch: () => 0,
    getZoom: () => 15,
    project: ([lng, lat]) => ({ x: lng * 100, y: lat * 100 }),
    unproject: ({ x, y }) => [x / 100, y / 100],
    on: () => {},
    off: () => {},
    getMetersPerPixel: () => 4.77,
    getLibraryName: () => 'mock',
    ...overrides,
  };
}

describe('ListenerManager', () => {
  it('updates position from map on updateFromMap()', () => {
    const engine = makeMockAudioEngine();
    const adapter = makeMockMapAdapter();
    const emitter = new EventEmitter();
    const manager = new ListenerManager(engine, adapter, emitter);

    manager.updateFromMap();

    expect(engine.setListenerPosition).toHaveBeenCalledWith(0, 0, 0);
    expect(engine.setListenerOrientation).toHaveBeenCalled();
  });

  it('emits listenerMoved on updateFromMap()', () => {
    const engine = makeMockAudioEngine();
    const adapter = makeMockMapAdapter();
    const emitter = new EventEmitter();
    const manager = new ListenerManager(engine, adapter, emitter);
    const handler = vi.fn();
    emitter.on('listenerMoved', handler);

    manager.updateFromMap();

    expect(handler).toHaveBeenCalledWith({ lng: 139.69, lat: 35.69, alt: 0 });
  });

  it('skips updateFromMap() when autoSync is disabled', () => {
    const engine = makeMockAudioEngine();
    const adapter = makeMockMapAdapter();
    const emitter = new EventEmitter();
    const manager = new ListenerManager(engine, adapter, emitter);

    manager.enableAutoSync(false);
    manager.updateFromMap();

    expect(engine.setListenerPosition).not.toHaveBeenCalled();
  });

  it('setPosition() disables autoSync', () => {
    const engine = makeMockAudioEngine();
    const adapter = makeMockMapAdapter();
    const emitter = new EventEmitter();
    const manager = new ListenerManager(engine, adapter, emitter);

    manager.setPosition([135, 34]);
    manager.updateFromMap(); // should be ignored now

    const { autoSync } = manager.getInfo();
    expect(autoSync).toBe(false);
    // setListenerPosition called once (from setPosition), not again from updateFromMap
    expect(engine.setListenerPosition).toHaveBeenCalledTimes(1);
  });

  it('getInfo() returns current state', () => {
    const engine = makeMockAudioEngine();
    const adapter = makeMockMapAdapter({ getBearing: () => 90, getPitch: () => 30 });
    const emitter = new EventEmitter();
    const manager = new ListenerManager(engine, adapter, emitter);

    manager.updateFromMap();
    const info = manager.getInfo();

    expect(info.autoSync).toBe(true);
    expect(info.orientation.bearing).toBe(90);
    expect(info.orientation.pitch).toBe(30);
  });

  describe('orientation vectors', () => {
    it('bearing=0 pitch=0 → forward = (0, 0, -1)', () => {
      const engine = makeMockAudioEngine();
      const adapter = makeMockMapAdapter({ getBearing: () => 0, getPitch: () => 0 });
      const emitter = new EventEmitter();
      const manager = new ListenerManager(engine, adapter, emitter);

      manager.updateFromMap();

      const call = (engine.setListenerOrientation as ReturnType<typeof vi.fn>).mock.calls[0] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
      const [forward, up] = call;
      // bearing=0 (North), pitch=0 (horizontal)
      expect(forward.x).toBeCloseTo(0);  // no East component
      expect(forward.y).toBeCloseTo(0);  // no vertical component
      expect(forward.z).toBeCloseTo(-1); // North = -Z
      expect(up.x).toBeCloseTo(0);
      expect(up.y).toBeCloseTo(1); // Up vector points up
      expect(up.z).toBeCloseTo(0);
    });

    it('bearing=90 pitch=0 → forward = (1, 0, 0) (East)', () => {
      const engine = makeMockAudioEngine();
      const adapter = makeMockMapAdapter({ getBearing: () => 90, getPitch: () => 0 });
      const emitter = new EventEmitter();
      const manager = new ListenerManager(engine, adapter, emitter);

      manager.updateFromMap();

      const call = (engine.setListenerOrientation as ReturnType<typeof vi.fn>).mock.calls[0] as [{ x: number; y: number; z: number }, unknown];
      const [forward] = call;
      expect(forward.x).toBeCloseTo(1);
      expect(forward.y).toBeCloseTo(0);
      expect(forward.z).toBeCloseTo(0);
    });
  });
});
