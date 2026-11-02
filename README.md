# geospatial-audio-js

A TypeScript library that places sound sources at longitude/latitude positions on a web map and plays them as 3D audio that follows the map camera's position and heading. It works with MapLibre GL JS, Leaflet and CesiumJS, and uses the Web Audio API's `PannerNode` (HRTF) for spatialization.

[日本語版](README.ja.md)

## Installation

```bash
npm install geospatial-audio-js
```

No map library is bundled. Install the one you use (maplibre-gl, leaflet or cesium) separately.

## Usage

This example places one sound source on a MapLibre GL JS map.

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

document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();

  await audio.addSound({
    id: 'birds',
    position: [139.691, 35.691], // [longitude, latitude, altitude in m (optional)]
    url: 'audio/birds.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: {
      refDistance: 10,   // no attenuation within this distance (m)
      maxDistance: 200,
      rolloffFactor: 1.5,
    },
  });
});
```

Browsers do not allow audio to start before a user gesture, so call `initialize()` inside a click (or similar) handler. `addSound()` resolves once the audio file has been fetched and decoded.

From then on, moving the map changes the direction and distance you hear each sound from. For a moving sound source, update its position with `updateSoundPosition('birds', [lng, lat, alt])`.

### Leaflet and CesiumJS

Swap the adapter. The rest of the API is the same.

```ts
new GeospatialAudio(new LeafletAdapter(map));
new GeospatialAudio(new CesiumAdapter(viewer, Cesium)); // pass the Cesium namespace too
```

Where the listener is depends on the adapter:

- With MapLibre and Leaflet, the listener stands at the map center at altitude 0. It turns with the map bearing, but stays level when the map is pitched. Leaflet cannot rotate, so the listener always faces north.
- With Cesium, the listener sits at the camera position (including altitude) and uses the camera's heading, pitch and roll directly. Giving a sound an altitude affects its vertical placement as well.

Calling `setListenerPosition()` or `setListenerOrientation()` stops following the map, so you can move the listener independently. Call `syncWithMap(true)` to follow the map again.

## Effects and distance culling

The following four effects are off by default. Each can be enabled on its own, and they can be combined.

```ts
audio.setReverb({ enabled: true, type: 'hall', wet: 0.3 });  // 'room' | 'hall' | 'outdoor', or an AudioBuffer as customIR
audio.setDopplerEffect({ enabled: true });     // shifts pitch as the distance to a sound changes
audio.setPropagationDelay({ enabled: true });  // delays each sound by distance / speed of sound (default 343.3 m/s)
audio.setAirAbsorption({ enabled: true });     // cuts more high frequencies the farther a sound is (lowpass filter)
```

Distance culling starts with `initialize()`. By default, sounds farther than 5000 m are paused and resumed when they come back in range, and at most 10 sounds play at once, nearest to the listener first.

```ts
audio.setOptimization({ cullingDistance: 2000, maxActiveSounds: 20 });
```

All methods and options, including playback control, events and debug info, are listed in [docs/api.md](docs/api.md).

## Limitations

- Longitude/latitude is converted to audio-space coordinates (meters) with an equirectangular approximation. Direction and distance errors grow the farther a sound is from the listener.
- Reverb is applied to the combined output of all sounds. Sounds cannot have different reverbs.
- The Doppler effect, propagation delay and air absorption are computed from the distance to each sound, sampled every 100 ms (configurable with `updateInterval`).
- Propagation delay is capped at 5 seconds (about 1.7 km at 343.3 m/s). `maxDelayTime` changes the cap, but only for sounds added after the change.
- There are no adapters for Google Maps or OpenLayers. Other map libraries can be used by implementing the `MapAdapter` interface.
- Supported browsers are the latest Chrome, Edge, Firefox and Safari (iOS 14+).

## Demos

Clone the repository, run `npm install`, then run one of the following and open http://localhost:5173/.

| Command | Content |
|---|---|
| `npm run dev:demo-maplibre` | MapLibre GL JS (2D/3D) |
| `npm run dev:demo-cesium` | CesiumJS |

The demo UI is in Japanese. See [docs/demo.md](docs/demo.md) for a walkthrough and [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
