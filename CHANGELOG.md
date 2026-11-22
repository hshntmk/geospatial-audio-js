# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Distance-based reverb** (`ReverbConfig.distanceRolloff`). By default the
  reverb is applied to the mix of all sounds, so the reverb-to-direct ratio
  is the same at any distance. With `distanceRolloff` set, each sound feeds
  the reverb through its own send, taken before its `PannerNode`, at a level
  that falls with distance by the inverse distance model with that rolloff.
  Set lower than the panner's `rolloffFactor`, the reverb fades more slowly
  than the direct sound, so far sounds come out wetter, as in real spaces.
  Without `distanceRolloff` the reverb works as before.
- **Output limiter** (`setLimiter()`), off by default. Sounds that add up
  past full scale are held below `threshold` (default -3 dBFS) instead of
  clipping. It sits just before the destination, so it also covers the
  reverb. The compressor's built-in makeup gain is cancelled, so output
  below the threshold is unchanged; it adds about 6 ms of latency.

### Changed

- **`pannerOptions.coneOuterAngle` now defaults to 360**, Web Audio's own
  default, instead of 0. With 0, a sound given only `coneInnerAngle` dropped
  straight to `coneOuterGain` (silent by default) just outside its inner
  cone; it now fades out towards the back. For example, with
  `coneInnerAngle: 60`, a listener 90° off the facing direction now hears
  the sound at about −4.4 dB instead of silence. Only sounds that set
  `coneInnerAngle` without `coneOuterAngle` are affected; to keep the old
  hard edge, set `coneOuterAngle` to the same value as `coneInnerAngle`.

### Fixed

- **`pannerOptions.orientationX/Y/Z` are now applied.** They were accepted
  by the `SoundPannerOptions` type but never passed to the `PannerNode`, so
  every sound faced east (the `PannerNode` default) and directional sounds
  set up with `coneInnerAngle` / `coneOuterAngle` pointed the wrong way.
  Sounds without cones are unaffected.

## [0.5.0] - 2026-11-20

### Fixed

- **Doppler effect and propagation delay no longer shift pitch twice.** A
  `DelayNode` whose delay changes over time already shifts the pitch, the
  same way a Doppler effect does. With both `setDopplerEffect()` and
  `setPropagationDelay()` enabled, that shift was multiplied by the Doppler
  `playbackRate`, roughly doubling it (about +190 cents instead of +96 for a
  source passing at 20 m/s). The Doppler effect now divides the delay's own
  shift out, so the pitch heard follows the `setDopplerEffect()` settings.
- **Propagation delay no longer makes moving sounds warble.** The delay was
  ramped with `setTargetAtTime`, whose slope changes within every update, so
  the pitch wobbled at the update rate (by up to a semitone at 20 m/s). The
  delay now moves in linear ramps, one per update, each as long as
  `updateInterval`. The ramps are scheduled 0.1 s ahead and chained end to
  end, so they never rewrite delay values the audio thread has already used
  (doing so clicks on every update). Each ramp is timed by when the sound
  and listener positions were last set rather than by when the update timer
  fired: positions arrive once per rendered frame and the timer jitters, and
  timing by the timer made the pitch step by about ±20 cents every update at
  60 m/s. The Doppler effect now times its velocity estimate the same way.

### Deprecated

- `PropagationDelayConfig.smoothing` is ignored. The linear ramp's length
  follows `updateInterval`.

## [0.4.0] - 2026-09-14

### Added

- **Air absorption** (`setAirAbsorption()`): distant sounds lose high
  frequencies, not just volume — the way real sound is muffled by air over
  distance. Modeled as a lowpass filter whose cutoff decays exponentially
  with distance, derived automatically the same way propagation delay and
  the Doppler effect are: continuous motion ramps the cutoff smoothly, while
  a jump (`flyTo`/`setView`, a sound teleported via `updateSoundPosition`)
  snaps instantly. Independent of `setDopplerEffect()` and
  `setPropagationDelay()` — all three can be enabled together.

### Fixed

- **Propagation delay no longer truncates a sound's tail.** `setPropagationDelay()`
  was forcing a sound's `DelayNode` delay to 0 the instant its own (undelayed)
  playback finished — which yanked the delay line's read position forward and
  discarded whatever audio was still queued waiting to be heard. Depending on
  the delay amount, this could produce a brief garbled blip near the sound's
  original (non-delayed) timing followed by silence, instead of the sound
  playing out correctly at its delayed time. This affected any non-looping
  sound with propagation delay enabled, regardless of distance. The same
  premature-reset pattern in `setAirAbsorption()`'s controller has also been
  fixed — a sound's filter cutoff no longer snaps back to "unfiltered" while
  delayed audio is still draining through it.

## [0.3.0] - 2026-09-13

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

- **Propagation delay** (`setPropagationDelay()`): each sound is delayed by
  `distance / speedOfSound`, so distant sounds arrive noticeably later, the
  way real sound travel works. The delay is derived automatically from
  distance and follows both moving sounds and listener/map movement —
  continuous motion (panning, a moving sound) ramps smoothly, while a jump
  (`flyTo`/`setView`, a sound teleported via `updateSoundPosition`) snaps
  instantly to avoid an audible sweep across the discontinuity. Independent
  of `setDopplerEffect()` — both can be enabled together.
- `LICENSE` file (MIT). The license was previously only declared in
  `package.json`.
- License sections in `README.md` / `README.ja.md`.

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