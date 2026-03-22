import type { Position } from '../types/index.js';
import type { MapAdapter, MapEvent } from './MapAdapter.js';

// Structural types — no hard dependency on the cesium package.
interface CesiumCartographic {
  longitude: number; // radians
  latitude: number;  // radians
  height: number;    // metres
}

interface CesiumCamera {
  positionCartographic: CesiumCartographic;
  heading: number; // radians, 0 = North
  pitch: number;   // radians, 0 = horizontal, -π/2 = down
  roll: number;    // radians
  /** Fired continuously while the camera is moving (threshold: percentageChanged). */
  changed: {
    addEventListener(handler: () => void): void;
    removeEventListener(handler: () => void): void;
  };
  /** 0.0–1.0: fraction of view change required to fire `changed`. Default 0.05. */
  percentageChanged: number;
}

interface CesiumCartesian2 { x: number; y: number }
interface CesiumCartesian3 { x: number; y: number; z: number }

interface CesiumViewer {
  camera: CesiumCamera;
  scene: {
    globe: unknown;
    canvas: { width: number; height: number };
  };
  // We call these via the global Cesium object to avoid import
  _cesiumRef?: unknown;
}

/**
 * Adapter for Cesium (CesiumJS v1+).
 *
 * Cesium is a 3D globe library, so altitude is fully supported.
 * Zoom level is approximated from camera height.
 *
 * Because Cesium fires a single `moveEnd` event for all camera changes
 * (move, rotate, zoom, pitch), all four MapEvents are forwarded to it.
 */
export class CesiumAdapter implements MapAdapter {
  private viewer: CesiumViewer;
  private cesium: Record<string, unknown>;

  /**
   * @param viewer  A Cesium.Viewer instance.
   * @param cesium  The global `Cesium` namespace object. Pass `window.Cesium` or
   *                `import * as Cesium from 'cesium'`.
   */
  constructor(viewer: CesiumViewer, cesium: Record<string, unknown>) {
    this.viewer = viewer;
    this.cesium = cesium;
    // Lower the threshold so `changed` fires more frequently during movement.
    // Default is 0.05 (5 % of view); 0.01 gives ~5× finer granularity.
    this.viewer.camera.percentageChanged = 0.01;
  }

  getCenter(): Position {
    const cart = this.viewer.camera.positionCartographic;
    return {
      lng: this.toDegrees(cart.longitude),
      lat: this.toDegrees(cart.latitude),
      alt: cart.height,
    };
  }

  getZoom(): number {
    return this.heightToZoom(this.viewer.camera.positionCartographic.height);
  }

  getBearing(): number {
    return this.toDegrees(this.viewer.camera.heading);
  }

  /**
   * Cesium pitch convention:
   *   0       = horizontal
   *  -Math.PI/2 = looking straight down
   * Our convention: 0 = horizontal, 90 = looking straight up.
   */
  getPitch(): number {
    return 90 + this.toDegrees(this.viewer.camera.pitch);
  }

  getRoll(): number {
    return this.toDegrees(this.viewer.camera.roll);
  }

  project(lngLat: [number, number]): { x: number; y: number } {
    const fromDegrees = this.cesium['Cartesian3'] as {
      fromDegrees(lng: number, lat: number): CesiumCartesian3;
    };
    const SceneTransforms = this.cesium['SceneTransforms'] as {
      worldToWindowCoordinates(
        scene: unknown,
        position: CesiumCartesian3,
        result?: CesiumCartesian2,
      ): CesiumCartesian2 | undefined;
    };

    const cartesian = fromDegrees.fromDegrees(lngLat[0], lngLat[1]);
    const result = SceneTransforms.worldToWindowCoordinates(this.viewer.scene, cartesian);
    return result ?? { x: 0, y: 0 };
  }

  unproject(point: { x: number; y: number }): [number, number] {
    const Cartesian2 = this.cesium['Cartesian2'] as new (x: number, y: number) => CesiumCartesian2;
    const Cartographic = this.cesium['Cartographic'] as {
      fromCartesian(cartesian: CesiumCartesian3): CesiumCartographic;
    };

    const pickEllipsoid = (this.viewer.camera as unknown as {
      pickEllipsoid(point: CesiumCartesian2): CesiumCartesian3 | undefined;
    }).pickEllipsoid;

    const cartesian = pickEllipsoid.call(this.viewer.camera, new Cartesian2(point.x, point.y));
    if (!cartesian) return [0, 0];

    const cart = Cartographic.fromCartesian(cartesian);
    return [this.toDegrees(cart.longitude), this.toDegrees(cart.latitude)];
  }

  /**
   * Cesium fires `camera.changed` continuously during movement
   * (once the camera has moved by more than `percentageChanged`).
   * All four MapEvents are mapped to it so audio updates while the camera moves.
   */
  on(_event: MapEvent, handler: () => void): void {
    this.viewer.camera.changed.addEventListener(handler);
  }

  off(_event: MapEvent, handler: () => void): void {
    this.viewer.camera.changed.removeEventListener(handler);
  }

  getMetersPerPixel(lat: number, zoom: number): number {
    const earthCircumference = 40_075_016.686;
    return (Math.cos((lat * Math.PI) / 180) * earthCircumference) / 2 ** (zoom + 8);
  }

  getLibraryName(): string {
    return 'cesium';
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
  }

  /** Approximate zoom level from camera height in metres. */
  private heightToZoom(height: number): number {
    if (height <= 0) return 20;
    // Inverse of: height ≈ earthRadius * 2^(maxZoom - zoom) / tileSize
    return Math.max(0, Math.log2(40_075_016.686 / (height * 256 / 512)));
  }
}
