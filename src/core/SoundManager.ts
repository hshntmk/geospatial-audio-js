import type { SoundConfig, SoundState, Position } from '../types/index.js';
import type { AudioEngine } from './AudioEngine.js';
import type { CoordinateConverter } from '../utils/CoordinateConverter.js';
import { SoundSource } from './SoundSource.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { logger } from '../utils/Logger.js';

/**
 * Manages all sound sources: creation, removal, playback control,
 * audio-buffer caching, and event forwarding.
 */
export class SoundManager {
  private sounds = new Map<string, SoundSource>();
  private bufferCache = new Map<string, AudioBuffer>();

  private audioEngine: AudioEngine;
  private coordinateConverter: CoordinateConverter;
  private eventEmitter: EventEmitter;

  constructor(
    audioEngine: AudioEngine,
    coordinateConverter: CoordinateConverter,
    eventEmitter: EventEmitter,
  ) {
    this.audioEngine = audioEngine;
    this.coordinateConverter = coordinateConverter;
    this.eventEmitter = eventEmitter;
  }

  async addSound(config: SoundConfig): Promise<void> {
    if (this.sounds.has(config.id)) {
      logger.warn(`Sound "${config.id}" already exists — replacing.`);
      this.removeSound(config.id);
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.loadBuffer(config.url);
    } catch (err) {
      this.eventEmitter.emit('soundError', config.id, err);
      throw err;
    }

    const sound = new SoundSource(config.id, audioBuffer, this.audioEngine, config);

    // Set initial 3D position
    const pos: Position = { lng: config.position[0], lat: config.position[1], alt: config.position[2] };
    sound.setPosition(this.coordinateConverter.geoToAudio(pos));

    // Forward SoundSource events to the public EventEmitter
    sound.on('playing', () => this.eventEmitter.emit('soundPlaying', config.id));
    sound.on('paused',  () => this.eventEmitter.emit('soundPaused',  config.id));
    sound.on('stopped', () => this.eventEmitter.emit('soundStopped', config.id));
    sound.on('ended',   () => this.eventEmitter.emit('soundEnded',   config.id));

    this.sounds.set(config.id, sound);
    this.eventEmitter.emit('soundLoaded', config.id);
    logger.debug(`Sound "${config.id}" loaded.`);

    if (config.autoplay) {
      sound.play();
    }
  }

  removeSound(id: string): void {
    const sound = this.sounds.get(id);
    if (!sound) return;
    sound.dispose();
    this.sounds.delete(id);
    logger.debug(`Sound "${id}" removed.`);
  }

  updateSoundPosition(id: string, position: [number, number, number?]): void {
    const sound = this.sounds.get(id);
    if (!sound) {
      logger.warn(`updateSoundPosition: sound "${id}" not found.`);
      return;
    }
    sound.setGeoPosition(position);
    const pos: Position = { lng: position[0], lat: position[1], alt: position[2] };
    sound.setPosition(this.coordinateConverter.geoToAudio(pos));
  }

  /** Re-computes 3D positions for all sounds (called when the map moves). */
  updateAllPositions(): void {
    this.sounds.forEach(sound => {
      sound.setPosition(this.coordinateConverter.geoToAudio(sound.geoPosition));
    });
  }

  playSound(id: string): void {
    this.sounds.get(id)?.play();
  }

  pauseSound(id: string): void {
    this.sounds.get(id)?.pause();
  }

  stopSound(id: string): void {
    this.sounds.get(id)?.stop();
  }

  setVolume(id: string, volume: number): void {
    this.sounds.get(id)?.setVolume(volume);
  }

  getVolume(id: string): number {
    return this.sounds.get(id)?.getVolume() ?? 0;
  }

  getSoundState(id: string): SoundState | undefined {
    return this.sounds.get(id)?.state;
  }

  getSound(id: string): SoundSource | undefined {
    return this.sounds.get(id);
  }

  getAllSounds(): SoundSource[] {
    return Array.from(this.sounds.values());
  }

  dispose(): void {
    this.sounds.forEach(s => s.dispose());
    this.sounds.clear();
    this.bufferCache.clear();
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio file: ${response.status} ${response.statusText} (${url})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioEngine.decodeAudioData(arrayBuffer);
    this.bufferCache.set(url, audioBuffer);
    return audioBuffer;
  }
}
