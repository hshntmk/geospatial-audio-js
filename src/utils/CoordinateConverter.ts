import type { Position, Vector3, ScaleConfig } from '../types/index.js';
import type { MapAdapter } from '../adapters/MapAdapter.js';

export class CoordinateConverter {
  private mapAdapter: MapAdapter;
  private scale: Required<ScaleConfig> = { horizontal: 1.0, vertical: 1.0, global: 1.0 };

  constructor(mapAdapter: MapAdapter) {
    this.mapAdapter = mapAdapter;
  }

  /**
   * Convert a geographic position to a Web Audio API 3D coordinate.
   * The listener is always at the origin (0, 0, 0).
   *
   * Uses the equirectangular approximation to convert longitude/latitude
   * differences to metres. This is camera-orientation-independent and works
   * correctly for both flat (MapLibre/Leaflet) and 3-D globe (Cesium) adapters.
   *
   * Axis convention (Web Audio API):
   *   X → East (+)
   *   Y → Up (+)
   *   Z → South (+)  i.e. North is -Z
   */
  geoToAudio(geoPosition: Position): Vector3 {
    const R = 6_371_000; // Earth radius in metres
    const listenerPos = this.mapAdapter.getCenter();
    const latRad = (listenerPos.lat * Math.PI) / 180;

    const hScale = this.scale.horizontal * this.scale.global;
    const vScale = this.scale.vertical * this.scale.global;

    // East displacement: longitude difference scaled by cos(lat) to account for meridian convergence
    const dEast  = (geoPosition.lng - listenerPos.lng) * (Math.PI / 180) * R * Math.cos(latRad);
    // North displacement: latitude difference (positive = north)
    const dNorth = (geoPosition.lat - listenerPos.lat) * (Math.PI / 180) * R;
    // Vertical displacement: relative to the listener's altitude (e.g. camera height in Cesium)
    const dAlt   = (geoPosition.alt ?? 0) - (listenerPos.alt ?? 0);

    return {
      x:  dEast  * hScale,
      y:  dAlt   * vScale,
      z: -dNorth * hScale, // North is -Z
    };
  }

  /**
   * Calculate the great-circle distance between two geographic positions
   * using the Haversine formula. Returns meters.
   */
  calculateDistance(pos1: Position, pos2: Position): number {
    const R = 6_371_000; // Earth radius in metres
    const lat1 = (pos1.lat * Math.PI) / 180;
    const lat2 = (pos2.lat * Math.PI) / 180;
    const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const dLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    const surfaceDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const altDiff = (pos2.alt ?? 0) - (pos1.alt ?? 0);

    return Math.sqrt(surfaceDist ** 2 + altDiff ** 2);
  }

  setScale(scale: ScaleConfig): void {
    this.scale = { ...this.scale, ...scale };
  }

  getScale(): Required<ScaleConfig> {
    return { ...this.scale };
  }
}
