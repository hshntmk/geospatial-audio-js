import type { Position } from '../types/index.js';
import type { MapAdapter } from './MapAdapter.js';

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

  /**
   * Always 0: the listener is a person standing at the map center
   * (getCenter returns alt 0), so their ears stay horizontal no matter how
   * the camera is tilted. MapLibre's own pitch (0 = top-down screen tilt)
   * describes the camera, not the listener, and must not be passed through —
   * doing so would make the listener stare into the sky on tilted views.
   */
  getPitch(): number {
    return 0;
  }

  project(lngLat: [number, number]): { x: number; y: number } {
    return this.map.project(lngLat);
  }

  unproject(point: { x: number; y: number }): [number, number] {
    const { lng, lat } = this.map.unproject(point);
    return [lng, lat];
  }

  /**
   * MapLibre fires 'move' for every camera transition — easeTo/jumpTo (which
   * back setZoom, setBearing, setPitch and all gestures) always wrap the
   * change in movestart/move/moveend. Subscribing to 'move' alone therefore
   * covers pan, rotate, zoom and pitch with exactly one callback per change,
   * where subscribing to 'rotate'/'zoom'/'pitch' as well would double-fire.
   */
  onCameraChange(handler: () => void): void {
    this.map.on('move', handler);
  }

  offCameraChange(handler: () => void): void {
    this.map.off('move', handler);
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
