import type { Position } from '../types/index.js';
import type { MapAdapter, MapEvent } from './MapAdapter.js';

// Structural type — no hard dependency on the leaflet package.
interface LeafletMap {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  latLngToContainerPoint(latlng: { lat: number; lng: number }): { x: number; y: number };
  containerPointToLatLng(point: { x: number; y: number }): { lat: number; lng: number };
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
}

// Leaflet fires different event names than our MapEvent type.
// Bearing / pitch are not supported (always 0).
const LEAFLET_EVENTS: Record<MapEvent, string[]> = {
  move:   ['move'],
  rotate: [],        // not supported — no-op
  zoom:   ['zoom'],
  pitch:  [],        // not supported — no-op
};

/**
 * Adapter for Leaflet (v1 / v2).
 *
 * Leaflet is a 2D map library: bearing and pitch are always 0.
 * The `rotate` and `pitch` MapEvents are silently ignored.
 */
export class LeafletAdapter implements MapAdapter {
  private map: LeafletMap;

  constructor(map: LeafletMap) {
    this.map = map;
  }

  getCenter(): Position {
    const { lat, lng } = this.map.getCenter();
    return { lng, lat, alt: 0 };
  }

  getZoom(): number {
    return this.map.getZoom();
  }

  /** Leaflet does not support camera bearing — always returns 0. */
  getBearing(): number {
    return 0;
  }

  /** Leaflet does not support camera pitch — always returns 0. */
  getPitch(): number {
    return 0;
  }

  project(lngLat: [number, number]): { x: number; y: number } {
    return this.map.latLngToContainerPoint({ lat: lngLat[1], lng: lngLat[0] });
  }

  unproject(point: { x: number; y: number }): [number, number] {
    const { lat, lng } = this.map.containerPointToLatLng(point);
    return [lng, lat];
  }

  on(event: MapEvent, handler: () => void): void {
    LEAFLET_EVENTS[event].forEach(e => this.map.on(e, handler));
  }

  off(event: MapEvent, handler: () => void): void {
    LEAFLET_EVENTS[event].forEach(e => this.map.off(e, handler));
  }

  getMetersPerPixel(lat: number, zoom: number): number {
    const earthCircumference = 40_075_016.686;
    return (Math.cos((lat * Math.PI) / 180) * earthCircumference) / 2 ** (zoom + 8);
  }

  getLibraryName(): string {
    return 'leaflet';
  }
}
