import { describe, it, expect, vi } from 'vitest';
import { LeafletAdapter } from '../../src/adapters/LeafletAdapter.js';

function makeMockLeafletMap(overrides?: object) {
  return {
    getCenter: () => ({ lat: 35.69, lng: 139.69 }),
    getZoom: () => 15,
    latLngToContainerPoint: ({ lat, lng }: { lat: number; lng: number }) => ({
      x: lng * 100,
      y: lat * 100,
    }),
    containerPointToLatLng: ({ x, y }: { x: number; y: number }) => ({
      lat: y / 100,
      lng: x / 100,
    }),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  };
}

describe('LeafletAdapter', () => {
  it('getCenter() returns lng/lat/alt=0', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    const center = adapter.getCenter();
    expect(center.lng).toBe(139.69);
    expect(center.lat).toBe(35.69);
    expect(center.alt).toBe(0);
  });

  it('getBearing() always returns 0', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    expect(adapter.getBearing()).toBe(0);
  });

  it('getPitch() always returns 0', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    expect(adapter.getPitch()).toBe(0);
  });

  it('project() delegates to latLngToContainerPoint', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    const result = adapter.project([139.69, 35.69]);
    expect(result.x).toBeCloseTo(139.69 * 100);
    expect(result.y).toBeCloseTo(35.69 * 100);
  });

  it('unproject() delegates to containerPointToLatLng', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    const [lng, lat] = adapter.unproject({ x: 100, y: 50 });
    expect(lng).toBeCloseTo(1.0);
    expect(lat).toBeCloseTo(0.5);
  });

  it('on("move") registers the leaflet move event', () => {
    const map = makeMockLeafletMap();
    const adapter = new LeafletAdapter(map);
    const handler = vi.fn();
    adapter.on('move', handler);
    expect(map.on).toHaveBeenCalledWith('move', handler);
  });

  it('on("rotate") is a no-op (Leaflet has no rotation)', () => {
    const map = makeMockLeafletMap();
    const adapter = new LeafletAdapter(map);
    adapter.on('rotate', vi.fn());
    expect(map.on).not.toHaveBeenCalled();
  });

  it('getLibraryName() returns "leaflet"', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    expect(adapter.getLibraryName()).toBe('leaflet');
  });

  it('getMetersPerPixel() returns a positive number', () => {
    const adapter = new LeafletAdapter(makeMockLeafletMap());
    expect(adapter.getMetersPerPixel(35, 15)).toBeGreaterThan(0);
  });
});
