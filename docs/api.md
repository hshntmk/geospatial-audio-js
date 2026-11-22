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
  coneInnerAngle?: number;  // directivity: inner cone angle (degrees), default: 360
  coneOuterAngle?: number;  // directivity: outer cone angle (degrees), default: 360
  coneOuterGain?:  number;  // directivity: gain outside the outer cone, default: 0
  orientationX?:   number;  // direction the sound faces (default: 1, 0, 0 = east)
  orientationY?:   number;
  orientationZ?:   number;
}
```

The orientation only matters when the cones are set: with the default `coneInnerAngle` of 360° the sound is equally loud in every direction. The defaults are Web Audio's own. Within `coneInnerAngle / 2` of the facing direction the sound is at full volume; between that and `coneOuterAngle / 2` it fades towards `coneOuterGain`, and beyond it stays at `coneOuterGain`. So with only `coneInnerAngle` set, the sound fades out towards the back. It uses the same axes as sound positions: X = east, Y = up, Z = south (so north is `orientationZ: -1`).

```ts
// A loudspeaker facing north, loud within ±30° and quiet behind
pannerOptions: { coneInnerAngle: 60, coneOuterAngle: 180, coneOuterGain: 0.1, orientationX: 0, orientationY: 0, orientationZ: -1 }
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

// Distance-based: far sounds come out wetter
audio.setReverb({ enabled: true, type: 'outdoor', distanceRolloff: 0.2 });
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
  distanceRolloff?: number; // makes the reverb depend on distance (see below). Default: off
}
```

#### Preset Characteristics

| `type` | `decay` | Use case |
|---|---|---|
| `'room'` | 1.0 s | Indoor / building |
| `'hall'` | 3.0 s | Concert hall / large space |
| `'outdoor'` | 0.4 s | Outdoors (minimal reflections) |

> **How it works:** Uses algorithmically generated impulse responses (white noise × exponential decay). No external IR files required.

#### Distance-based reverb (`distanceRolloff`)

By default the reverb is applied to the mix of all sounds, so the reverb-to-direct ratio is the same at any distance. In real spaces the direct sound fades with distance while the reverberation stays at a similar level, so far sounds sound wetter, which is a strong cue for distance.

With `distanceRolloff` set, each sound feeds the reverb through its own send, taken before its `PannerNode`. The send level follows the inverse distance model with the sound's own `refDistance`:

```
send = refDistance / (refDistance + distanceRolloff × (max(distance, refDistance) − refDistance))
```

Set `distanceRolloff` lower than the panner's `rolloffFactor` (default 1) so the reverb fades more slowly than the direct sound. `0` keeps the reverb level the same at any distance. With `rolloffFactor: 1` and `distanceRolloff: 0.2`, the reverb-to-direct ratio rises by about 9 dB at 5 × `refDistance` and 12 dB at 20 × `refDistance`, compared with `refDistance`.

> **Note:** the send is taken before the panner, so the reverb carries no direction, and it is mono going into the convolver. At `refDistance` it is therefore about 2–3 dB louder than in the default mode with the same `wet`, where the reverb gets the panned signal.

#### Internal Audio Graph (when reverb is enabled)

```
masterGain ─┬─ dryGain ─────────────── destination
             └─ reverbGain ─ convolver ─ destination
```

With `distanceRolloff`:

```
each sound: … ─ volume ─┬─ PannerNode ─ masterGain ─ dryGain ─ destination
                        └─ reverb send ─ reverbSendBus ─ reverbGain ─ convolver ─ destination
```

### `disableReverb(): void`

Disables reverb and restores the audio graph to its original routing.

---

## Doppler Effect

### `setDopplerEffect(config: DopplerConfig): void`

Enables or updates the Doppler pitch shift. The radial velocity is derived **automatically** from how the distance to each playing sound changes, so it follows both moving sounds (`updateSoundPosition`) and listener/map movement — no need to supply velocities yourself. Pass `{ enabled: false }` to disable and restore neutral pitch.

```ts
// Enable with defaults
audio.setDopplerEffect({ enabled: true });

// Exaggerate the effect and use a custom speed of sound
audio.setDopplerEffect({ enabled: true, dopplerFactor: 1.5, speedOfSound: 340 });

// Disable
audio.setDopplerEffect({ enabled: false });
```

#### DopplerConfig

```ts
interface DopplerConfig {
  enabled:         boolean;
  speedOfSound?:   number;  // m/s, default: 343.3
  dopplerFactor?:  number;  // strength multiplier (0 = none), default: 1.0
  updateInterval?: number;  // radial-velocity sampling interval (ms), default: 100
  maxPitchRatio?:  number;  // clamp, applied as [1/ratio, ratio], default: 2.0
  smoothing?:      number;  // setTargetAtTime time constant (s), default: 0.05
  listenerMotion?: boolean; // whether camera/map motion shifts pitch, default: true
}
```

**`listenerMotion`** controls whether listener (camera/map) movement contributes to the pitch shift:

| value | behaviour |
|---|---|
| `true` (default) | Physically correct — both source **and** listener motion shift pitch. |
| `false` | Only the sound source's own motion shifts pitch. Panning the map/camera leaves pitch unchanged, avoiding "noisy" shifts during navigation. |

With `false`, the shift comes from the source's velocity projected onto the listener→source line of sight; the listener's own velocity is ignored. Note that left/right panning and distance attenuation still follow the camera as usual — only the pitch is held steady.

**How it works:** the pitch ratio applied to each source's `playbackRate` is

```
ratio = speedOfSound / (speedOfSound + dopplerFactor × dr/dt)
```

where `dr/dt` is the rate of change of distance (positive = receding → lower pitch; negative = approaching → higher pitch).

> **Note:** Because the shift uses `AudioBufferSourceNode.playbackRate`, it changes playback speed as well as pitch. This is natural for looping sounds (sirens, engines); for one-shot clips the effect is most noticeable on sustained tones. The native Web Audio Doppler (`PannerNode.setVelocity`) was removed from the spec, so this is computed in-library.

---

## Propagation Delay

### `setPropagationDelay(config: PropagationDelayConfig): void`

Enables or updates the sound-propagation delay: each sound is delayed by `distance / speedOfSound`, so distant sounds arrive noticeably later — the way real sound travel works. The delay is derived **automatically** from distance and follows both moving sounds and listener/map movement, the same way `setDopplerEffect` does. Pass `{ enabled: false }` to disable and restore zero delay.

```ts
// Enable with defaults
audio.setPropagationDelay({ enabled: true });

// Custom speed of sound and a larger delay cap for a bigger scene
audio.setPropagationDelay({ enabled: true, speedOfSound: 340, maxDelayTime: 10 });

// Disable
audio.setPropagationDelay({ enabled: false });
```

#### PropagationDelayConfig

```ts
interface PropagationDelayConfig {
  enabled:         boolean;
  speedOfSound?:   number;  // m/s, default: 343.3
  updateInterval?: number;  // distance sampling interval (ms), default: 100
  maxDelayTime?:   number;  // delay cap (s) = DelayNode capacity, default: 5
  smoothing?:      number;  // deprecated, ignored (see below)
  jumpThreshold?:  number;  // distance jump (m) that triggers a snap, default: 500
}
```

**How it works:** each sound's audio passes through a `DelayNode` set to `min(distance / speedOfSound, maxDelayTime)`. On every update tick the controller compares the new distance to the previous sample:

| distance change | behaviour |
|---|---|
| ≤ `jumpThreshold` | Continuous motion (panning the map, a moving sound). The delay is **ramped** linearly to the new value over one `updateInterval`, scheduled 0.1 s ahead and chained onto the previous ramp. |
| > `jumpThreshold` | A discontinuity (`flyTo`/`setView`, a sound teleported via `updateSoundPosition`) — the delay **snaps** instantly instead of sweeping audibly across the jump. |

> **Note:** `maxDelayTime` sets a `DelayNode`'s fixed capacity at creation time, so raising it only affects sounds added *after* the change — existing sounds keep whatever capacity they were created with. Sounds farther than `maxDelayTime * speedOfSound` have their delay clamped rather than growing further; raise `maxDelayTime` for large scenes, at the cost of a larger delay buffer per sound.
>
> A delay that changes over time also shifts the pitch, by a factor of `1 − (rate of change of the delay)`. This is the same shift a Doppler effect gives, so a moving sound changes pitch with propagation delay alone. The linear ramp keeps that shift steady; the earlier `setTargetAtTime` ramp made it warble at the update rate, which is why `smoothing` is no longer used.
>
> When `setDopplerEffect` is enabled as well, it divides the delay's own shift out of its `playbackRate`, so the pitch heard is the one its settings describe (`dopplerFactor`, `listenerMotion`) rather than the two shifts multiplied.

---

## Air Absorption

### `setAirAbsorption(config: AirAbsorptionConfig): void`

Enables or updates air absorption: distant sounds lose high frequencies — not just volume — the way real sound is muffled by air over distance. The cutoff is derived **automatically** from distance and follows both moving sounds and listener/map movement, the same way `setDopplerEffect` and `setPropagationDelay` do. Pass `{ enabled: false }` to disable and restore the unfiltered (fully open) cutoff.

```ts
// Enable with defaults
audio.setAirAbsorption({ enabled: true });

// Muffle over a shorter range, and cap how dull distant sounds get
audio.setAirAbsorption({ enabled: true, falloffDistance: 200, minCutoffFrequency: 2000 });

// Disable
audio.setAirAbsorption({ enabled: false });
```

#### AirAbsorptionConfig

```ts
interface AirAbsorptionConfig {
  enabled:              boolean;
  maxCutoffFrequency?:  number;  // cutoff (Hz) at distance 0 — unfiltered, default: 20000
  minCutoffFrequency?:  number;  // cutoff (Hz) approached at long range — most muffled, default: 1000
  falloffDistance?:     number;  // characteristic distance (m) of the exponential decay, default: 500
  updateInterval?:      number;  // distance sampling interval (ms), default: 100
  Q?:                   number;  // BiquadFilterNode lowpass Q, default: 0.707 (no resonance)
  smoothing?:           number;  // setTargetAtTime time constant (s), default: 0.1
  jumpThreshold?:       number;  // distance jump (m) that triggers a snap, default: 500
}
```

**How it works:** each sound's audio passes through a lowpass `BiquadFilterNode` whose cutoff frequency is

```
cutoff = minCutoffFrequency + (maxCutoffFrequency − minCutoffFrequency) × e^(−distance / falloffDistance)
```

so it starts at `maxCutoffFrequency` (unfiltered) at distance 0 and decays toward `minCutoffFrequency` (most muffled) as distance grows — about 63% of the way there at one `falloffDistance`, ~95% by three. As with propagation delay, each update tick compares the new distance to the previous sample:

| distance change | behaviour |
|---|---|
| ≤ `jumpThreshold` | Continuous motion (panning the map, a moving sound) — the cutoff is **ramped** smoothly via `AudioParam.setTargetAtTime`. |
| > `jumpThreshold` | A discontinuity (`flyTo`/`setView`, a sound teleported via `updateSoundPosition`) — the cutoff **snaps** instantly instead of sweeping audibly across the jump. |

> **Note:** this models air absorption as a single-pole lowpass with an exponential distance curve — a perceptual approximation used by most game-audio engines, not a physically exact multi-band atmospheric-absorption model (e.g. ISO 9613-1). It is independent of `setDopplerEffect` and `setPropagationDelay`; all three can be enabled together, each modeling a different aspect of real sound propagation (pitch, arrival time, and timbre respectively).

---

## Master Volume

### `setMasterVolume(volume: number): void`

Sets the master volume applied to all sound sources (`0.0`–`1.0`, clamped if out of range).

```ts
audio.setMasterVolume(0.8);
```

### `setLimiter(config: LimiterConfig): void`

Turns the output limiter on or off. It is off by default. When on, sounds that add up past full scale are held below `threshold` instead of clipping. With ten overlapping sounds that peaked at 2.1 (clipping on about 30,000 samples in 1.3 s), the peak stayed at 0.82 with the limiter on.

```ts
audio.setLimiter({ enabled: true });                 // threshold -3 dBFS
audio.setLimiter({ enabled: true, threshold: -6 });  // hold the output lower
audio.setLimiter({ enabled: false });
```

```ts
interface LimiterConfig {
  enabled:    boolean;
  threshold?: number;  // dBFS, default: -3
}
```

> **How it works:** a `DynamicsCompressorNode` (ratio 20, hard knee, attack 3 ms, release 250 ms) is inserted just before the destination, so it also covers the reverb. Web Audio's compressor raises everything by its own makeup gain (1.71 dB at the default threshold); a `GainNode` after it takes that back out, so output below the threshold is unchanged. The compressor's lookahead delays the output by about 6 ms.

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
interface MapAdapter {
  getCenter(): Position;
  getZoom(): number;
  /** Bearing in degrees: 0 = North, clockwise. */
  getBearing(): number;
  /**
   * Listener pitch as an elevation angle in degrees:
   * 0 = horizontal, positive = up, negative = down.
   * Flat-map adapters (MapLibre, Leaflet) return 0 — the listener stands on
   * the ground; Cesium returns the camera's elevation angle.
   */
  getPitch(): number;
  getRoll?(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: { x: number; y: number }): [number, number];
  /**
   * Registers a handler invoked whenever the camera/view changes for any
   * reason (pan, rotate, zoom, pitch). The adapter bundles the map library's
   * native events into this single notification.
   */
  onCameraChange(handler: () => void): void;
  /** Removes a previously registered camera-change handler. */
  offCameraChange(handler: () => void): void;
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
  DopplerConfig,
  PropagationDelayConfig,
  AirAbsorptionConfig,
  DebugConfig, DebugInfo, SoundDebugInfo,
  MapAdapter,
} from 'geospatial-audio-js';
```