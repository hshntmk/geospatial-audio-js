# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-12

### ⚠ Breaking Changes

- **`MapAdapter` event API redesigned.** The per-event subscription methods
  `on(event, handler)` / `off(event, handler)` and the `MapEvent` type
  (`'move' | 'rotate' | 'zoom' | 'pitch'`) have been removed. Adapters now
  expose a single camera-change notification instead:

  ```ts
  // Before (0.2.x)
  adapter.on('move', handler);
  adapter.on('rotate', handler);
  adapter.off('move', handler);

  // After (0.3.0)
  adapter.onCameraChange(handler);   // fires on pan, rotate, zoom and pitch
  adapter.offCameraChange(handler);
  ```

  The library only ever subscribed the same handler to all four events, and
  on Cesium all four mapped to the same native `camera.changed` event — so the
  handler fired four times per camera change. The single-event contract
  removes that redundancy at the interface level.

  **Who is affected:** only code that implements a custom `MapAdapter` or
  calls the adapter event methods directly. Code that uses `GeospatialAudio`
  with the bundled `MapLibreAdapter` / `LeafletAdapter` / `CesiumAdapter`
  requires no changes. The `MapEvent` type is no longer exported.

- **`MapAdapter.getPitch()` is now defined as an elevation angle**
  (0 = horizontal, positive = up, negative = down — the convention the
  documentation always described), and the bundled adapters were aligned to it:

  - `CesiumAdapter` now passes the camera's elevation angle through
    (previously it returned `90 + pitch`, which pointed the listener's ears
    toward the sky while the camera looked at the ground).
  - `MapLibreAdapter` now always returns `0`: the listener is modelled as a
    person standing at the map center, so their ears stay horizontal
    regardless of the camera tilt (previously the raw screen tilt was passed
    through, making the listener look up by the tilt angle).

  **Who is affected:** custom `MapAdapter` implementations should return an
  elevation angle from `getPitch()`. `getListenerInfo().orientation.pitch`
  reports the new convention. `setListenerOrientation()` behaves exactly as
  documented and is unchanged.

### Fixed

- Cesium: the listener now faces the camera's actual view direction. Sounds
  centered on screen are heard in front instead of ~90° off-axis (see the
  `getPitch()` entry under Breaking Changes).
- MapLibre: tilting the map no longer points the listener's ears into the sky.
- `setListenerPosition()` now affects spatialization (panning and distance
  attenuation). Previously sound positions were always computed relative to
  the map center, so a manually set listener position only influenced
  distance culling and the Doppler effect.
- `enableDebug()` now actually logs to the console. The `logAudioParams` and
  `logPerformance` hooks were never wired up; in addition, debug output now
  bypasses the library log level, so `setLogLevel()` is not required to see it.
- Sounds paused by the `maxActiveSounds` limit no longer oscillate between
  paused and playing on every optimizer tick (an audible stutter every
  ~100 ms when more sounds than the limit were in range).
- Sounds paused by the `maxActiveSounds` limit are now resumed (closest
  first, in-range only) when playing slots free up. Previously they stayed
  paused indefinitely.
- Sounds added before the first map event are now positioned relative to the
  actual map center instead of latitude/longitude (0, 0).
- Cesium: the camera-change handler is registered once instead of four times,
  removing three redundant listener/position updates per camera change.
- MapLibre: zoom, rotate and pitch gestures no longer trigger duplicate
  audio updates (the adapter now subscribes to `move` only, which MapLibre
  fires for every camera transition).
- `syncWithMap(true)` re-syncs the listener immediately instead of waiting
  for the next map event.

### Added

- `LICENSE` file (MIT). The license was previously only declared in
  `package.json`.
- License sections in `README.md` / `README.ja.md`.

### Removed

- `dev:demo-doppler` / `build:demo-doppler` npm scripts, which referenced a
  demo directory that is not part of the published repository.

## [0.2.0]

### Added

- Doppler effect (`setDopplerEffect()`), with automatic radial-velocity
  estimation for moving sounds and listener/map motion.
- npm packaging (`geospatial-audio-js` on npm).

## [0.1.0]

### Added

- Initial public release: 3D spatial audio for web maps via the Web Audio
  API (`PannerNode`), with adapters for MapLibre GL JS, Leaflet and Cesium,
  reverb presets, distance culling and debug utilities.