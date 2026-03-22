import type { Position } from '../types/index.js';

export type MapEvent = 'move' | 'rotate' | 'zoom' | 'pitch';

/**
 * Common interface every map-library adapter must implement.
 * Abstracts away the differences between MapLibre, Cesium, Leaflet, etc.
 */
export interface MapAdapter {
  /** Returns the current map center as a geographic position. */
  getCenter(): Position;

  /** Returns the current zoom level (or an approximation for 3D globes). */
  getZoom(): number;

  /** Returns the camera bearing in degrees (0 = North, clockwise). */
  getBearing(): number;

  /** Returns the camera pitch in degrees (0 = horizontal). */
  getPitch(): number;

  /** Returns the camera roll in degrees. Optional – only for 3D globes. */
  getRoll?(): number;

  /** Projects a geographic coordinate to screen-space pixels. */
  project(lngLat: [number, number]): { x: number; y: number };

  /** Unprojects screen-space pixels to a geographic coordinate. */
  unproject(point: { x: number; y: number }): [number, number];

  /** Registers a handler for a normalised map event. */
  on(event: MapEvent, handler: () => void): void;

  /** Removes a previously registered handler. */
  off(event: MapEvent, handler: () => void): void;

  /**
   * Returns how many metres one screen pixel represents at the given
   * latitude and zoom level.
   */
  getMetersPerPixel(lat: number, zoom: number): number;

  /** Returns a human-readable identifier for the underlying map library. */
  getLibraryName(): string;
}
