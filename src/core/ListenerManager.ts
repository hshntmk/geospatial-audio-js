import type { Position, Orientation, ListenerInfo, Vector3 } from '../types/index.js';
import type { AudioEngine } from './AudioEngine.js';
import type { MapAdapter } from '../adapters/MapAdapter.js';
import { EventEmitter } from '../utils/EventEmitter.js';

/**
 * Manages the audio listener (the "ears" / camera).
 *
 * The listener is always placed at the Web Audio origin (0, 0, 0).
 * Only the orientation changes with the camera bearing/pitch.
 * Sound positions are expressed relative to the listener (see CoordinateConverter).
 */
export class ListenerManager {
  private audioEngine: AudioEngine;
  private mapAdapter: MapAdapter;
  private eventEmitter: EventEmitter;

  private autoSync = true;
  private currentPosition: Position = { lng: 0, lat: 0, alt: 0 };
  private currentOrientation: Orientation = { bearing: 0, pitch: 0, roll: 0 };

  constructor(audioEngine: AudioEngine, mapAdapter: MapAdapter, eventEmitter: EventEmitter) {
    this.audioEngine = audioEngine;
    this.mapAdapter = mapAdapter;
    this.eventEmitter = eventEmitter;
  }

  /** Called every time the map moves/rotates/pitches. */
  updateFromMap(): void {
    if (!this.autoSync) return;

    const center = this.mapAdapter.getCenter();
    const bearing = this.mapAdapter.getBearing();
    const pitch = this.mapAdapter.getPitch();

    this.currentPosition = center;
    this.currentOrientation = { bearing, pitch, roll: 0 };

    this.audioEngine.setListenerPosition(0, 0, 0);
    const { forward, up } = this.calculateOrientation(bearing, pitch);
    this.audioEngine.setListenerOrientation(forward, up);

    this.eventEmitter.emit('listenerMoved', this.currentPosition);
  }

  enableAutoSync(enabled: boolean): void {
    this.autoSync = enabled;
  }

  /** Manually override the listener's geographic position (disables auto-sync). */
  setPosition(position: [number, number, number?]): void {
    this.autoSync = false;
    this.currentPosition = { lng: position[0], lat: position[1], alt: position[2] };
    // Listener stays at origin in audio space; position is tracked for culling
    this.audioEngine.setListenerPosition(0, 0, 0);
    this.eventEmitter.emit('listenerMoved', this.currentPosition);
  }

  /** Manually override the listener's orientation (disables auto-sync). */
  setOrientation(bearing: number, pitch: number, roll = 0): void {
    this.autoSync = false;
    this.currentOrientation = { bearing, pitch, roll };
    const { forward, up } = this.calculateOrientation(bearing, pitch, roll);
    this.audioEngine.setListenerOrientation(forward, up);
    this.eventEmitter.emit('listenerRotated', bearing, pitch);
  }

  getInfo(): ListenerInfo {
    return {
      position: { ...this.currentPosition },
      orientation: { ...this.currentOrientation },
      autoSync: this.autoSync,
    };
  }

  getCurrentPosition(): Position {
    return { ...this.currentPosition };
  }

  /**
   * Converts bearing + pitch (MapLibre convention) into Web Audio forward / up vectors.
   *
   * Coordinate convention (Web Audio):
   *   X → East, Y → Up, Z → South (North = -Z)
   *
   * bearing: 0 = North, clockwise
   * pitch:   0 = horizontal, positive = looking up
   */
  private calculateOrientation(
    bearing: number,
    pitch: number,
    _roll = 0,
  ): { forward: Vector3; up: Vector3 } {
    const b = (bearing * Math.PI) / 180;
    const p = (pitch * Math.PI) / 180;

    const forward: Vector3 = {
      x: Math.sin(b) * Math.cos(p),
      y: Math.sin(p),
      z: -Math.cos(b) * Math.cos(p),
    };

    const up: Vector3 = {
      x: -Math.sin(b) * Math.sin(p),
      y: Math.cos(p),
      z: Math.cos(b) * Math.sin(p),
    };

    return { forward, up };
  }
}
