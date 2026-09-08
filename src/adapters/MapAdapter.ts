import type { Position } from '../types/index.js';

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

  /**
   * Returns the pitch to apply to the audio listener, as an elevation angle
   * in degrees: 0 = horizontal, positive = up, negative = down.
   *
   * For 3D adapters where the listener rides the camera (Cesium) this is the
   * camera's elevation angle. Flat-map adapters (MapLibre, Leaflet) model the
   * listener as a person standing at the map center, so they return 0
   * regardless of the camera tilt.
   */
  getPitch(): number;

  /** Returns the camera roll in degrees. Optional – only for 3D globes. */
  getRoll?(): number;

  /** Projects a geographic coordinate to screen-space pixels. */
  project(lngLat: [number, number]): { x: number; y: number };

  /** Unprojects screen-space pixels to a geographic coordinate. */
  unproject(point: { x: number; y: number }): [number, number];

  /**
   * Registers a handler invoked whenever the camera/view changes for any
   * reason (pan, rotate, zoom, pitch). The adapter bundles whatever native
   * events its map library fires into this single notification; the handler
   * should fire once per change, not once per native event.
   */
  onCameraChange(handler: () => void): void;

  /** Removes a previously registered camera-change handler. */
  offCameraChange(handler: () => void): void;

  /**
   * Returns how many metres one screen pixel represents at the given
   * latitude and zoom level.
   */
  getMetersPerPixel(lat: number, zoom: number): number;

  /** Returns a human-readable identifier for the underlying map library. */
  getLibraryName(): string;
}