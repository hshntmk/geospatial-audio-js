import type { Position } from '../types/index.js';
import type { MapAdapter, MapEvent } from './MapAdapter.js';

// Use a structural type so we don't hard-depend on the maplibre-gl package.
interface MapLibreMap {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: { x: number; y: number }): { lng: number; lat: number };
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
}

const EVENT_MAP: Record<MapEvent, string> = {
  move: 'move',
  rotate: 'rotate',
  zoom: 'zoom',
  pitch: 'pitch',
};

/** Adapter for MapLibre GL JS (v4+). */
export class MapLibreAdapter implements MapAdapter {
  private map: MapLibreMap;

  constructor(map: unknown) {
    this.map = map as MapLibreMap;
  }

  getCenter(): Position {
    const { lng, lat } = this.map.getCenter();
    return { lng, lat, alt: 0 };
  }

  getZoom(): number {
    return this.map.getZoom();
  }

  getBearing(): number {
    return this.map.getBearing();
  }

  getPitch(): number {
    return this.map.getPitch();
  }

  project(lngLat: [number, number]): { x: number; y: number } {
    return this.map.project(lngLat);
  }

  unproject(point: { x: number; y: number }): [number, number] {
    const { lng, lat } = this.map.unproject(point);
    return [lng, lat];
  }

  on(event: MapEvent, handler: () => void): void {
    this.map.on(EVENT_MAP[event], handler);
  }

  off(event: MapEvent, handler: () => void): void {
    this.map.off(EVENT_MAP[event], handler);
  }

  getMetersPerPixel(lat: number, zoom: number): number {
    // Web Mercator approximation (256 px tiles)
    const earthCircumference = 40_075_016.686; // metres
    return (Math.cos((lat * Math.PI) / 180) * earthCircumference) / 2 ** (zoom + 8);
  }

  getLibraryName(): string {
    return 'maplibre-gl';
  }
}
