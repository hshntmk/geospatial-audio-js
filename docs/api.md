# API Reference

> All public methods and type definitions for the `GeospatialAudio` class

---

## Table of Contents

1. [Constructor](#constructor)
2. [Lifecycle](#lifecycle)
3. [Sound Management](#sound-management)
4. [Listener Management](#listener-management)
5. [Reverb](#reverb)
6. [Master Volume](#master-volume)
7. [Performance Optimization](#performance-optimization)
8. [Scale Adjustment](#scale-adjustment)
9. [Debug](#debug)
10. [Logging](#logging)
11. [Events](#events)
12. [Type Definitions](#type-definitions)

---

## Constructor

```ts
new GeospatialAudio(adapter: MapAdapter, options?: GeospatialAudioOptions)
```

| Parameter | Type | Description |
|---|---|---|
| `adapter` | `MapAdapter` | An instance of a map library adapter |
| `options` | `GeospatialAudioOptions` | Optional. Global audio parameters |

Create an adapter instance explicitly and pass it to the constructor. Each adapter class can be imported from `geospatial-audio-js`.

```ts
import { GeospatialAudio, MapLibreAdapter, LeafletAdapter, CesiumAdapter } from 'geospatial-audio-js';

// MapLibre
const audio = new GeospatialAudio(new MapLibreAdapter(map));

// Leaflet
const audio = new GeospatialAudio(new LeafletAdapter(leafletMap));

// Cesium
const audio = new GeospatialAudio(new CesiumAdapter(viewer, Cesium));
```

### GeospatialAudioOptions

```ts
interface GeospatialAudioOptions {
  distanceModel?: 'linear' | 'inverse' | 'exponential'; // default: 'inverse'
  refDistance?:   number;  // default: 5
  maxDistance?:   number;  // default: 10000
  rolloffFactor?: number;  // default: 1
  panningModel?:  'HRTF' | 'equalpower'; // default: 'HRTF'
}
```

---

## Lifecycle

### `initialize(): Promise<void>`

Resumes the AudioContext and performs the initial sync of the listener and sound sources. Due to browser autoplay policies, **this must be called inside a user gesture handler**.

```ts
button.addEventListener('click', async () => {
  await audio.initialize();
});
```

### `dispose(): void`

Releases all sound sources, the AudioContext, and event listeners. Call this when leaving the page.

```ts
window.addEventListener('beforeunload', () => audio.dispose());
```

### `checkAutoplaySupport(): Promise<boolean>`

Returns whether the AudioContext is in the `running` state. Returns `false` before a user gesture.

---

## Sound Management

### `addSound(config: SoundConfig): Promise<void>`

Fetches and decodes an audio file, then adds a sound source. The same URL is cached internally.

```ts
await audio.addSound({
  id: 'bell',
  position: [139.691, 35.691],       // [longitude, latitude]
  url: 'audio/bell.mp3',
  loop: true,
  autoplay: true,
  pannerOptions: {
    refDistance:   10,
    maxDistance:   200,
    rolloffFactor: 1.5,
  },
});
```

#### SoundConfig

```ts
interface SoundConfig {
  id:            string;
  position:      [number, number, number?];  // [longitude, latitude, altitude(m)?]
  url:           string;
  loop?:         boolean;                    // default: false
  volume?:       number;                     // 0–1, default: 1.0
  autoplay?:     boolean;                    // auto-play after initialize()
  maxDistance?:  number;                     // culling distance (m). Uses cullingDistance if not set
  pannerOptions?: SoundPannerOptions;
}
```

#### SoundPannerOptions

```ts
interface SoundPannerOptions {
  panningModel?:  'HRTF' | 'equalpower';
  distanceModel?: 'linear' | 'inverse' | 'exponential';
  refDistance?:   number;   // distance (m) at which volume equals 1.0
  maxDistance?:   number;   // maximum distance (m) for PannerNode
  rolloffFactor?: number;   // distance attenuation factor (higher = steeper drop-off)
  coneInnerAngle?: number;  // directivity: inner cone angle (degrees)
  coneOuterAngle?: number;  // directivity: outer cone angle (degrees)
  coneOuterGain?:  number;  // directivity: gain outside the outer cone
}
```

---

### `removeSound(id: string): void`

Stops and removes a sound source.

### `playSound(id: string): void`

Starts playback of a sound source.

### `pauseSound(id: string): void`

Pauses a sound source.

### `stopSound(id: string): void`

Stops a sound source (resets playback position).

### `setVolume(id: string, volume: number): void`

Sets the volume of a sound source (`0.0`–`1.0`).

### `getVolume(id: string): number`

Returns the current volume of a sound source.

### `getSoundState(id: string): SoundState | undefined`

Returns the state of a sound source. Returns `undefined` if the sound does not exist.

```ts
type SoundState = 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';
```

### `updateSoundPosition(id: string, position: [number, number, number?]): void`

Updates the position of a moving sound source in real time.

```ts
// Track a drone in flight
audio.updateSoundPosition('drone', [newLng, newLat, altitude]);
```

---

## Listener Management

### `syncWithMap(enabled: boolean): void`

Enables or disables automatic synchronization with the map camera. Enabled (`true`) by default.

### `setListenerPosition(position: [number, number, number?]): void`

Manually sets the listener's geographic position. Calling this disables auto-sync.

```ts
audio.setListenerPosition([139.69, 35.69, 0]);
```

### `setListenerOrientation(bearing: number, pitch: number, roll?: number): void`

Manually sets the listener's orientation. Calling this disables auto-sync.

| Parameter | Description |
|---|---|
| `bearing` | Azimuth (degrees): 0=North, 90=East, 180=South, 270=West |
| `pitch` | Elevation (degrees): 0=horizontal, positive=upward |
| `roll` | Roll (degrees): optional |

### `getListenerInfo(): ListenerInfo`

Returns the current listener information.

```ts
interface ListenerInfo {
  position:    { lng: number; lat: number; alt?: number };
  orientation: { bearing: number; pitch: number; roll: number };
  autoSync:    boolean;
}
```

---

## Reverb

### `setReverb(config: ReverbConfig): void`

Configures the reverb effect. Passing `enabled: false` is equivalent to calling `disableReverb()`.

```ts
// Use a preset
audio.setReverb({
  enabled: true,
  type: 'room',   // 'room' | 'hall' | 'outdoor'
  wet: 0.3,       // reverb mix 0–1 (default: 0.3)
  dry: 1.0,       // direct signal 0–1 (default: 1.0)
});

// Specify decay directly (takes priority over type)
audio.setReverb({ enabled: true, decay: 2.5, wet: 0.4, dry: 0.8 });

// Use a custom impulse response (AudioBuffer)
audio.setReverb({ enabled: true, customIR: myIRBuffer, wet: 0.5 });
```

#### ReverbConfig

```ts
interface ReverbConfig {
  enabled:    boolean;
  type?:      'room' | 'hall' | 'outdoor'; // preset
  decay?:     number;      // reverb tail length (seconds). Takes priority over type
  wet?:       number;      // reverb mix 0–1 (default: 0.3)
  dry?:       number;      // direct signal 0–1 (default: 1.0)
  customIR?:  AudioBuffer; // custom impulse response
}
```

#### Preset Characteristics

| `type` | `decay` | Use case |
|---|---|---|
| `'room'` | 1.0 s | Indoor / building |
| `'hall'` | 3.0 s | Concert hall / large space |
| `'outdoor'` | 0.4 s | Outdoors (minimal reflections) |

> **How it works:** Uses algorithmically generated impulse responses (white noise × exponential decay). No external IR files required.

#### Internal Audio Graph (when reverb is enabled)

```
masterGain ─┬─ dryGain ─────────────── destination
             └─ reverbGain ─ convolver ─ destination
```

### `disableReverb(): void`

Disables reverb and restores the audio graph to its original routing.

---

## Master Volume

### `setMasterVolume(volume: number): void`

Sets the master volume applied to all sound sources (`0.0`–`1.0`, clamped if out of range).

```ts
audio.setMasterVolume(0.8);
```

---

## Performance Optimization

### `setOptimization(config: Partial<OptimizationConfig>): void`

Configures culling and the maximum number of simultaneously active sounds.

```ts
audio.setOptimization({
  maxActiveSounds: 10,    // max simultaneous sounds (default: 10)
  cullingDistance: 5000,  // automatically stop sounds beyond this distance in m (default: 5000)
  updateInterval:  100,   // culling update interval in ms (default: 100)
});
```

```ts
interface OptimizationConfig {
  maxActiveSounds?: number; // default: 10
  cullingDistance?: number; // default: 5000
  updateInterval?:  number; // default: 100
  priorityMode?:    'distance' | 'volume' | 'custom'; // default: 'distance'
}
```

Culled sounds trigger the `soundCulled` event, and are automatically resumed when back in range (`soundUnculled`).

---

## Scale Adjustment

### `setScale(scale: ScaleConfig): void`

Adjusts the scale mapping from geographic distance to audio distance.

```ts
audio.setScale({
  horizontal: 1.0, // horizontal (longitude/latitude) scale
  vertical:   1.0, // vertical (altitude) scale
  global:     1.0, // overall scale
});
```

> **Example use case:** Increase `horizontal` to make sound sources spread over a large area (several km) more audible.

---

## Debug

### `enableDebug(config: DebugConfig): void`

Enables debug mode.

```ts
audio.enableDebug({
  logAudioParams:  true, // log PannerNode parameters to console on each position update
  logPerformance:  true, // log culling processing time to console
});
```

```ts
interface DebugConfig {
  logAudioParams?:  boolean;
  logPerformance?:  boolean;
}
```

### `disableDebug(): void`

Disables debug mode.

### `getDebugInfo(): DebugInfo`

Returns a snapshot of the current audio state.

```ts
const info = audio.getDebugInfo();
console.log(info);
// {
//   activeSounds: 3,
//   totalSounds:  6,
//   culledSounds: 2,
//   audioContext: { state: 'running', sampleRate: 48000, currentTime: 12.5 },
//   sounds: [
//     {
//       id:                 'wave',
//       state:              'playing',
//       geoPosition:        { lng: 139.052, lat: 37.940, alt: 0 },
//       audioPosition:      { x: -12.3, y: -500, z: 8.7 },
//       volume:             0.8,
//       distanceFromListener: 501.4
//     },
//     ...
//   ]
// }
```

```ts
interface DebugInfo {
  activeSounds: number;
  totalSounds:  number;
  culledSounds: number;
  audioContext: { state: string; sampleRate: number; currentTime: number };
  sounds:       SoundDebugInfo[];
}

interface SoundDebugInfo {
  id:                   string;
  state:                SoundState;
  geoPosition:          { lng: number; lat: number; alt?: number };
  audioPosition:        { x: number; y: number; z: number };
  volume:               number;
  distanceFromListener: number;
}
```

---

## Logging

### `setLogLevel(level: LogLevel): void`

Sets the internal log output level for the library.

```ts
audio.setLogLevel('debug'); // most verbose
audio.setLogLevel('info');  // default
audio.setLogLevel('warn');
audio.setLogLevel('error');
audio.setLogLevel('none');  // silent
```

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
```

---

## Events

### `on(event: string, handler: (...args: unknown[]) => void): void`

Registers an event listener.

### `off(event: string, handler: (...args: unknown[]) => void): void`

Removes an event listener.

### `removeAllListeners(event?: string): void`

Removes all listeners. If `event` is specified, removes only listeners for that event.

### Event Reference

```ts
// Sound events
audio.on('soundLoaded',   (id: string) => {});              // fetch and decode complete
audio.on('soundPlaying',  (id: string) => {});              // playback started
audio.on('soundPaused',   (id: string) => {});              // paused
audio.on('soundStopped',  (id: string) => {});              // stopped
audio.on('soundEnded',    (id: string) => {});              // non-looping sound finished playing
audio.on('soundCulled',   (id: string) => {});              // automatically stopped due to distance culling
audio.on('soundUnculled', (id: string) => {});              // back in range and automatically resumed
audio.on('soundError',    (id: string, err: Error) => {});  // load / playback error

// Listener events
audio.on('listenerMoved',   (pos: Position) => {});
audio.on('listenerRotated', (bearing: number, pitch: number) => {});

// System events
audio.on('initialized', () => {});
audio.on('disposed',    () => {});
```

---

## Type Definitions

### Coordinates

```ts
/** Geographic coordinate */
interface Position {
  lng: number;   // longitude
  lat: number;   // latitude
  alt?: number;  // altitude (m), optional
}

/** 3D vector (audio coordinate system) */
interface Vector3 { x: number; y: number; z: number; }

/** Camera orientation */
interface Orientation { bearing: number; pitch: number; roll: number; }
```

### Adapter

```ts
/** Supported map event types */
type MapEvent = 'move' | 'rotate' | 'zoom' | 'pitch';

interface MapAdapter {
  getCenter(): Position;
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getRoll?(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: { x: number; y: number }): [number, number];
  on(event: MapEvent, handler: () => void): void;
  off(event: MapEvent, handler: () => void): void;
  getMetersPerPixel(lat: number, zoom: number): number;
  getLibraryName(): string;
}
```

### Exports

```ts
// Classes
export { GeospatialAudio } from 'geospatial-audio-js';
export { MapLibreAdapter } from 'geospatial-audio-js';
export { LeafletAdapter }  from 'geospatial-audio-js';
export { CesiumAdapter }   from 'geospatial-audio-js';
// Types
export type {
  GeospatialAudioOptions,
  SoundConfig, SoundState, SoundPannerOptions, SoundInfo,
  Position, Vector3, Orientation,
  ListenerInfo,
  ScaleConfig, OptimizationConfig,
  LogLevel, PanningModelType, DistanceModelType,
  ReverbConfig, ReverbPreset,
  DebugConfig, DebugInfo, SoundDebugInfo,
  MapAdapter, MapEvent,
} from 'geospatial-audio-js';
```