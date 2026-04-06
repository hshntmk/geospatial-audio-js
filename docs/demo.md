# Demo Guide

> How to run and understand the sample demos in the `demo/` and `demo-cesium/` directories

---

## Available Demos

| Demo | Map Library | Command |
|---|---|---|
| MapLibre Demo | MapLibre GL JS (2D/3D) | `npm run dev:demo` |
| Cesium Demo | CesiumJS (3D Globe) | `npm run dev:demo-cesium` |

---

## MapLibre Demo

### Getting Started

```bash
npm install
npm run dev:demo
```

Open `http://localhost:5173/` in your browser and click the **"Start Audio"** button.

> **Headphones recommended** — The HRTF-based 3D spatial audio effect is best experienced with headphones.

### Controls

| Input | Action |
|---|---|
| `W` / `A` / `S` / `D` | Move around the map |
| `Shift` + above | Move faster |
| Mouse drag | Rotate the view |
| Scroll | Zoom in / out |

### Directory Structure

```
demo/
  index.html          — Entry point (HTML)
  src/
    main.ts           — Demo main (library usage example)
    style.css         — UI styles
  vite.config.ts      — Dev server config
  public/
    audio/            — Audio files (MP3)
```

---

## Cesium Demo

### Getting Started

```bash
npm install
npm run dev:demo-cesium
```

Open `http://localhost:5173/` in your browser and click the **"Start Audio"** button.

> To use all Cesium features, you need an access token from a free [Cesium Ion](https://ion.cesium.com/) account.
> The demo uses GSI (Geospatial Information Authority of Japan) tiles and works without a token.

### Controls

| Input | Action |
|---|---|
| Left drag | Rotate the view |
| Right drag / Middle drag | Move the camera |
| Scroll | Change altitude (zoom in / out) |

Since Cesium renders a 3D globe, the camera's **altitude, tilt, and heading** all affect spatial audio positioning.

### Directory Structure

```
demo-cesium/
  index.html          — Entry point (includes Cesium CDN script tag)
  src/
    main.ts           — Demo main
    style.css         — UI styles
  vite.config.ts      — Dev server config
                        (audio files are shared from demo/public/)
```

### Loading Cesium via CDN

The demo loads Cesium from a CDN `<script>` tag, which automatically sets `window.Cesium` (= `globalThis.Cesium`).

Pass both the `viewer` and the `Cesium` namespace explicitly to `CesiumAdapter`.

```ts
import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';

// declare const Cesium: any; (window.Cesium is set via CDN)
const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);
```

If you bundle Cesium via ESM (`import * as Cesium from 'cesium'`), you can pass it the same way.

---

## Common: UI Overview

### Status Panel (top right)

Displays the current state of each sound source in real time.

| Color | State |
|---|---|
| Green | Playing |
| Yellow | Out of range (automatically stopped by culling) |
| Gray | Loading / stopped |
| Red | Error |

### Sound Source Visualization

| Demo | Display |
|---|---|
| MapLibre | Orange circle markers + semi-transparent rings (GeoJSON layer) |
| Cesium | Colored points + labels + semi-transparent ellipses (Cesium Entity) |

---

## Code Walkthrough

### 1. Initializing GeospatialAudio

```ts
import { GeospatialAudio, MapLibreAdapter, CesiumAdapter } from 'geospatial-audio-js';

// MapLibre
const audio = new GeospatialAudio(new MapLibreAdapter(map), {
  distanceModel: 'inverse',
  panningModel: 'HRTF',
});

// Cesium
const audio = new GeospatialAudio(new CesiumAdapter(viewer, Cesium), {
  distanceModel: 'inverse',
  panningModel: 'HRTF',
});
```

Adapters are created explicitly and passed to the constructor. The `GeospatialAudio` API is identical regardless of which map library you use.

### 2. Adding Sound Sources

```ts
await audio.addSound({
  id: 'wave',
  position: [139.052, 37.940],  // [longitude, latitude]
  url: 'audio/wave.mp3',
  loop: true,
  autoplay: true,
  pannerOptions: {
    refDistance: 10,            // distance (m) at which volume equals 1.0
    maxDistance: 100,           // maximum distance for PannerNode
    rolloffFactor: 1.5,         // rate of distance attenuation
  },
});
```

`addSound()` asynchronously fetches and decodes the audio file, then connects it to a PannerNode. The same URL is cached internally.

### 3. Initialization (Resuming the AudioContext)

```ts
startBtn.addEventListener('click', async () => {
  await audio.initialize(); // resume AudioContext + sync with map
  await audio.addSound(...);
});
```

Due to browser autoplay restrictions, the `AudioContext` cannot run until after a user gesture.

### 4. Updating UI State via Events

```ts
audio.on('soundPlaying',  (id) => setState(id, 'playing'));
audio.on('soundCulled',   (id) => setState(id, 'culled'));   // went out of range
audio.on('soundUnculled', (id) => setState(id, 'playing')); // came back in range
audio.on('soundError',    (id) => setState(id, 'error'));
```

### 5. Cesium Entity Visualization

The library handles only audio processing. Cesium visualization is implemented using `viewer.entities.add()`.

```ts
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
  point: {
    pixelSize: 12,
    color: Cesium.Color.fromCssColorString('#e85d04'),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
  label: { text: '🌊 Shoreline', ... },
});

// Listening range ring
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
  ellipse: {
    semiMajorAxis: 100, // maxDistance (m)
    semiMinorAxis: 100,
    material: Cesium.Color.fromCssColorString('#e85d04').withAlpha(0.08),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
});
```

---

## Sound Source Reference

Sound sources and parameters used across the demos.

| ID | Name | refDistance | maxDistance | rolloffFactor |
|---|---|---|---|---|
| `wave` | Shoreline waves | 10m | 100m | 1.5 |
| `aburazemi` | Aburazemi cicada | 5m | 50m | 2.0 |
| `minminzemi` | Minminzemi cicada | 10m | 50m | 2.0 |
| `umineko` | Black-tailed gull | 10m | 100m | 1.0 |
| `baseball` | Baseball sounds | 10m | 100m | 1.0 |
| `intersection` | Intersection | 10m | 100m | 1.5 |

- **refDistance** — distance (m) at which volume equals 1.0
- **maxDistance** — beyond this distance (m), the sound becomes inaudible (also used as the culling distance)
- **rolloffFactor** — higher values produce steeper distance attenuation

---

## References

- [Web Audio API — PannerNode (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode)