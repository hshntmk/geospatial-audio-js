import { describe, it, expect } from 'vitest';
import { CoordinateConverter } from '../../src/utils/CoordinateConverter.js';
import type { MapAdapter } from '../../src/adapters/MapAdapter.js';

const R = 6_371_000; // must match CoordinateConverter internal value

/** Minimal mock adapter centred at (lng=0, lat=0). */
function makeMockAdapter(overrides?: Partial<MapAdapter>): MapAdapter {
  return {
    getCenter: () => ({ lng: 0, lat: 0, alt: 0 }),
    getZoom: () => 15,
    getBearing: () => 0,
    getPitch: () => 0,
    project: ([lng, lat]) => ({ x: lng * 1000, y: lat * 1000 }),
    unproject: ({ x, y }) => [x / 1000, y / 1000],
    on: () => {},
    off: () => {},
    getMetersPerPixel: () => 4.77,
    getLibraryName: () => 'mock',
    ...overrides,
  };
}

/** Metres per degree of longitude at lat=0. */
const M_PER_DEG_LNG = (Math.PI / 180) * R * Math.cos(0); // cos(0) = 1
/** Metres per degree of latitude. */
const M_PER_DEG_LAT = (Math.PI / 180) * R;

describe('CoordinateConverter', () => {
  describe('geoToAudio()', () => {
    it('returns origin when sound is at the listener position', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const result = converter.geoToAudio({ lng: 0, lat: 0 });
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(0);
    });

    it('maps East (+lng) to positive X', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const result = converter.geoToAudio({ lng: 0.001, lat: 0 });
      expect(result.x).toBeCloseTo(0.001 * M_PER_DEG_LNG, 1);
      expect(result.z).toBeCloseTo(0);
    });

    it('maps North (+lat) to negative Z', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const result = converter.geoToAudio({ lng: 0, lat: 0.001 });
      expect(result.x).toBeCloseTo(0);
      expect(result.z).toBeCloseTo(-0.001 * M_PER_DEG_LAT, 1); // North = -Z
    });

    it('maps South (-lat) to positive Z', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const result = converter.geoToAudio({ lng: 0, lat: -0.001 });
      expect(result.z).toBeGreaterThan(0);
    });

    it('maps altitude to Y axis relative to listener altitude', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      // listener alt = 0, sound alt = 100 → dAlt = 100
      expect(converter.geoToAudio({ lng: 0, lat: 0, alt: 100 }).y).toBeCloseTo(100);
    });

    it('subtracts listener altitude (e.g. Cesium camera height) from Y', () => {
      const converter = new CoordinateConverter(
        makeMockAdapter({ getCenter: () => ({ lng: 0, lat: 0, alt: 500 }) }),
      );
      // sound at ground (alt=0), listener at 500 m → Y = -500
      expect(converter.geoToAudio({ lng: 0, lat: 0, alt: 0 }).y).toBeCloseTo(-500);
    });

    it('applies horizontal scale correctly', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      converter.setScale({ horizontal: 2.0 });
      const result = converter.geoToAudio({ lng: 0.001, lat: 0 });
      expect(result.x).toBeCloseTo(0.001 * M_PER_DEG_LNG * 2.0, 1);
    });
  });

  describe('calculateDistance()', () => {
    it('returns 0 for same position', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const dist = converter.calculateDistance({ lng: 0, lat: 0 }, { lng: 0, lat: 0 });
      expect(dist).toBe(0);
    });

    it('computes ~111 km per degree of latitude', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const dist = converter.calculateDistance({ lng: 0, lat: 0 }, { lng: 0, lat: 1 });
      expect(dist).toBeCloseTo(111_195, -2); // ~111.195 km, within ±100 m
    });

    it('accounts for altitude difference', () => {
      const converter = new CoordinateConverter(makeMockAdapter());
      const flat = converter.calculateDistance({ lng: 0, lat: 0 }, { lng: 0, lat: 0, alt: 0 });
      const with_alt = converter.calculateDistance({ lng: 0, lat: 0 }, { lng: 0, lat: 0, alt: 100 });
      expect(with_alt).toBeGreaterThan(flat);
      expect(with_alt).toBeCloseTo(100);
    });
  });
});
