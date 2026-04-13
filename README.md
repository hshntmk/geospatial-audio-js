# geospatial-audio-js

A general-purpose JavaScript library that adds 3D spatial audio to web map libraries.
Places geographically-positioned sound sources in 3D space using the Web Audio API's `PannerNode`. Automatically synchronizes the listener's orientation with map movement, rotation, and pitch to deliver an immersive 3D audio experience.

[日本語版 README はこちら](README.ja.md)

## Features

- **Map library agnostic** — Adapter pattern supports MapLibre GL JS, Leaflet, and Cesium
- **Web Audio API based** — High-quality 3D audio via HRTF
- **Reverb** — Room, hall, and outdoor presets, or custom IR for environmental acoustics
- **Distance culling** — Automatically stops and resumes sound sources beyond a specified distance

## Installation

```bash
npm install geospatial-audio-js
```

## Quick Start

### MapLibre GL JS

```ts
import maplibregl from 'maplibre-gl';
import { GeospatialAudio, MapLibreAdapter } from 'geospatial-audio-js';

const map = new maplibregl.Map({
  container: 'map',
  style: '...',
  center: [139.69, 35.69],
  zoom: 16,
});

const audio = new GeospatialAudio(new MapLibreAdapter(map));

// AudioContext must be resumed after a user gesture
document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();

  await audio.addSound({
    id: 'birds',
    position: [139.691, 35.691], // [longitude, latitude]
    url: 'audio/birds.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: {
      refDistance: 10,    // reference distance (m) for full volume
      maxDistance: 200,   // beyond this distance (m), sound becomes inaudible
      rolloffFactor: 1.5,
    },
  });
});
```

### Leaflet

```ts
import L from 'leaflet';
import { GeospatialAudio, LeafletAdapter } from 'geospatial-audio-js';

const map = L.map('map').setView([35.69, 139.69], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const audio = new GeospatialAudio(new LeafletAdapter(map));

document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();
  await audio.addSound({ id: 'birds', position: [139.691, 35.691], url: 'audio/birds.mp3', loop: true, autoplay: true });
});
```

### Cesium

```ts
import * as Cesium from 'cesium';
import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';

const viewer = new Cesium.Viewer('cesiumContainer');

const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);

document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();
  await audio.addSound({ id: 'birds', position: [139.691, 35.691, 0], url: 'audio/birds.mp3', loop: true, autoplay: true });
});
```

As you pan and rotate the map, the distance and direction to each sound source change and the 3D audio updates in real time.

## Key API

### Sound Management

```ts
// Add (async — fetches and decodes the audio file)
await audio.addSound({ id, position, url, loop, volume, autoplay, pannerOptions });

// Playback control
audio.playSound('id');
audio.pauseSound('id');
audio.stopSound('id');
audio.setVolume('id', 0.5);
audio.removeSound('id');

// Update position (for moving sound sources)
audio.updateSoundPosition('id', [lng, lat, altitude]);
```

### Listener (Camera) Management

```ts
// Auto-sync with the map camera (enabled by default)
audio.syncWithMap(true);

// Set position and orientation manually
audio.setListenerPosition([lng, lat, altitude]);
audio.setListenerOrientation(bearing, pitch, roll);
```

### Reverb (Environmental Acoustics)

```ts
// Use a preset
audio.setReverb({
  enabled: true,
  type: 'room',   // 'room' | 'hall' | 'outdoor'
  wet: 0.3,
  dry: 0.7,
});

// Disable reverb
audio.disableReverb();
```

### Master Volume

```ts
audio.setMasterVolume(0.8); // 0.0 – 1.0
```

### Performance Optimization

```ts
audio.setOptimization({
  maxActiveSounds: 10,    // maximum number of simultaneously playing sounds
  cullingDistance: 5000,  // automatically stop sounds beyond this distance (m)
  updateInterval: 100,    // culling update interval (ms)
});
```

### Debug

```ts
// Enable debug mode (logs to console)
audio.enableDebug({ logAudioParams: true, logPerformance: true });

// Get a snapshot of the current audio state
const info = audio.getDebugInfo();
// {
//   activeSounds: 3,
//   totalSounds: 6,
//   culledSounds: 2,
//   audioContext: { state: 'running', sampleRate: 48000, currentTime: 12.5 },
//   sounds: [{ id: 'birds', state: 'playing', volume: 0.8, distanceFromListener: 42 }, ...]
// }

audio.disableDebug();
```

### Events

```ts
audio.on('soundLoaded',   (id) => console.log(`${id} loaded`));
audio.on('soundPlaying',  (id) => { /* ... */ });
audio.on('soundCulled',   (id) => console.log(`${id} is too far`));
audio.on('soundUnculled', (id) => console.log(`${id} is in range again`));
audio.on('soundError',    (id, err) => console.error(err));
```

### Lifecycle

```ts
// Initialize (call after a user gesture)
await audio.initialize();

// Clean up
audio.dispose();
```

## Demo

See the demos to experience the library in action. For details, see [docs/demo.md](docs/demo.md).

| Demo | Command |
|---|---|
| MapLibre GL JS (2D/3D) | `npm run dev:demo` |
| CesiumJS (3D Globe) | `npm run dev:demo-cesium` |

```bash
# MapLibre demo
npm run dev:demo

# Cesium demo
npm run dev:demo-cesium
```

Both are available at `http://localhost:5173/`.

## Documentation

| Document | Description |
|---|---|
| [docs/api.md](docs/api.md) | **API Reference** (all methods and type definitions) |
| [docs/demo.md](docs/demo.md) | Demo setup and walkthrough |

## Browser Support

Browsers that support the Web Audio API (`PannerNode`):

- Chrome / Edge (latest)
- Firefox (latest)
- Safari (latest, iOS 14+)

## Supported Map Libraries

| Library | Status |
|---|---|
| MapLibre GL JS | ✅ Supported |
| Leaflet | ✅ Supported |
| Cesium | ✅ Supported |
| Google Maps | 🔜 Planned (Phase 3) |