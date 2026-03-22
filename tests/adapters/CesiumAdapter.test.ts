import { describe, it, expect, vi } from 'vitest';
import { CesiumAdapter } from '../../src/adapters/CesiumAdapter.js';

const DEG = Math.PI / 180;

function makeMockViewer(overrides?: object) {
  return {
    camera: {
      positionCartographic: {
        longitude: 139.69 * DEG,
        latitude: 35.69 * DEG,
        height: 500,
      },
      heading: 90 * DEG,  // East
      pitch: -45 * DEG,   // 45° below horizontal
      roll: 0,
      changed: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      percentageChanged: 0.05,
      pickEllipsoid: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
    },
    scene: {},
    ...overrides,
  };
}

function makeMockCesium() {
  return {
    Cartesian3: {
      fromDegrees: (lng: number, lat: number) => ({ x: lng, y: lat, z: 0 }),
    },
    Cartesian2: class { constructor(public x: number, public y: number) {} },
    SceneTransforms: {
      worldToWindowCoordinates: vi.fn(() => ({ x: 400, y: 300 })),
    },
    Cartographic: {
      fromCartesian: () => ({ longitude: 139.69 * DEG, latitude: 35.69 * DEG, height: 0 }),
    },
  } as unknown as Record<string, unknown>;
}

describe('CesiumAdapter', () => {
  it('getCenter() converts radians to degrees', () => {
    const adapter = new CesiumAdapter(makeMockViewer() as never, makeMockCesium());
    const center = adapter.getCenter();
    expect(center.lng).toBeCloseTo(139.69, 2);
    expect(center.lat).toBeCloseTo(35.69, 2);
    expect(center.alt).toBe(500);
  });

  it('getBearing() converts heading from radians to degrees', () => {
    const adapter = new CesiumAdapter(makeMockViewer() as never, makeMockCesium());
    expect(adapter.getBearing()).toBeCloseTo(90, 1);
  });

  it('getPitch() converts Cesium pitch convention (90 + deg)', () => {
    // Cesium pitch = -45° → ourPitch = 90 + (-45) = 45
    const adapter = new CesiumAdapter(makeMockViewer() as never, makeMockCesium());
    expect(adapter.getPitch()).toBeCloseTo(45, 1);
  });

  it('getPitch() returns 0 for horizontal view (Cesium pitch = -90°)', () => {
    const viewer = makeMockViewer({ camera: { ...makeMockViewer().camera, pitch: -90 * DEG } });
    const adapter = new CesiumAdapter(viewer as never, makeMockCesium());
    expect(adapter.getPitch()).toBeCloseTo(0, 1);
  });

  it('project() delegates to SceneTransforms.worldToWindowCoordinates', () => {
    const cesium = makeMockCesium();
    const adapter = new CesiumAdapter(makeMockViewer() as never, cesium);
    const result = adapter.project([139.69, 35.69]);
    expect(result).toEqual({ x: 400, y: 300 });
  });

  it('on() registers to camera.changed', () => {
    const viewer = makeMockViewer();
    const adapter = new CesiumAdapter(viewer as never, makeMockCesium());
    const handler = vi.fn();
    adapter.on('move', handler);
    expect(viewer.camera.changed.addEventListener).toHaveBeenCalledWith(handler);
  });

  it('off() removes from camera.changed', () => {
    const viewer = makeMockViewer();
    const adapter = new CesiumAdapter(viewer as never, makeMockCesium());
    const handler = vi.fn();
    adapter.off('rotate', handler);
    expect(viewer.camera.changed.removeEventListener).toHaveBeenCalledWith(handler);
  });

  it('constructor sets percentageChanged to 0.01', () => {
    const viewer = makeMockViewer();
    new CesiumAdapter(viewer as never, makeMockCesium());
    expect(viewer.camera.percentageChanged).toBe(0.01);
  });

  it('getLibraryName() returns "cesium"', () => {
    const adapter = new CesiumAdapter(makeMockViewer() as never, makeMockCesium());
    expect(adapter.getLibraryName()).toBe('cesium');
  });

  it('getZoom() returns a reasonable zoom level from height', () => {
    const adapter = new CesiumAdapter(makeMockViewer() as never, makeMockCesium());
    const zoom = adapter.getZoom(); // height = 500m
    expect(zoom).toBeGreaterThan(10);
    expect(zoom).toBeLessThan(25);
  });
});
