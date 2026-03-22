import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';
import type { SoundConfig } from 'geospatial-audio-js';
import './style.css';

// Cesium is loaded via CDN script tag — sets window.Cesium (globalThis.Cesium).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Cesium: any;

// ── Sound definitions ──────────────────────────────────────────────────────
// Same locations as the MapLibre demo (Japanese coastal area).

interface SoundDef extends SoundConfig {
  name: string;
  color: string;
}

const SOUND_DEFS: SoundDef[] = [
  {
    id: 'wave',
    name: '🌊 波打ち際',
    color: '#3B9BF4',
    position: [139.0527681367994, 37.940138058957864, 0],   // 海面
    url: 'audio/wave.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.5 },
  },
  {
    id: 'aburazemi',
    name: '🦗 アブラゼミ',
    color: '#06d6a0',
    position: [139.05414679993584, 37.940149770707585, 5],  // 樹幹あたり 5m
    url: 'audio/aburazemi.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 5, maxDistance: 50, rolloffFactor: 2 },
  },
  {
    id: 'minminzemi',
    name: '🦗 ミンミンゼミ',
    color: '#ffd166',
    position: [139.0553913762711, 37.94057995593127, 12],   // 高い梢 12m
    url: 'audio/minminzemi.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 50, rolloffFactor: 2 },
  },
  {
    id: 'umineko',
    name: '🐦 ウミネコ',
    color: '#e85d04',
    position: [139.05341141783293, 37.94063268576998, 50],  // 飛翔中 50m
    url: 'audio/umineko.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 200, rolloffFactor: 1.0 },
  },
  {
    id: 'baseball',
    name: '⚾ 野球の音',
    color: '#ef476f',
    position: [139.04832425986365, 37.93584061308863, 0],   // グラウンド
    url: 'audio/baseball.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.0 },
  },
  {
    id: 'intersection',
    name: '🚦 交差点',
    color: '#8338ec',
    position: [139.05464460458862, 37.94057492970517, 5],   // 信号機 5m
    url: 'audio/intersection.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.5 },
  },
];

// ── Cesium Viewer setup ────────────────────────────────────────────────────

const CENTER_LNG = 139.05379810679622;
const CENTER_LAT = 37.94003763613765;
const INITIAL_HEIGHT = 600; // metres above ellipsoid

const viewer = new Cesium.Viewer('cesiumContainer', {
  // Use GSI satellite imagery — no Cesium Ion token required
  // Note: imageryProvider was removed in CesiumJS v1.117; use baseLayer instead.
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
      credit: '<a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
      minimumLevel: 2,
      maximumLevel: 18,
    }),
  ),
  // Flat terrain — avoids needing a Cesium Ion token for terrain tiles
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  // Simplify the UI
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  infoBox: false,
  selectionIndicator: false,
  fullscreenButton: false,
});

// Initial camera position — tilt 45° downward to show the terrain
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(CENTER_LNG, CENTER_LAT, INITIAL_HEIGHT),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch:   Cesium.Math.toRadians(-45),
    roll:    0,
  },
});

// ── GeospatialAudio setup ──────────────────────────────────────────────────
// Cesium は CDN で window.Cesium として利用可能（declare const Cesium: any で参照）

const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);

// ── ウミネコ flight route ─────────────────────────────────────────────────────
// 8 waypoints forming a clockwise oval over the coastal area at ~50 m altitude.

const UMINEKO_ROUTE: [number, number, number][] = [
  [139.0534, 37.9428, 52],  // 北
  [139.0560, 37.9420, 58],  // 北東
  [139.0575, 37.9406, 46],  // 東
  [139.0560, 37.9392, 52],  // 南東
  [139.0534, 37.9384, 56],  // 南
  [139.0508, 37.9392, 44],  // 南西
  [139.0492, 37.9406, 50],  // 西
  [139.0508, 37.9420, 54],  // 北西
];

const UMINEKO_SPEED = 22; // m/s（カモメの巡航速度）

function routeSegLen(a: [number, number, number], b: [number, number, number]): number {
  const R   = 6_371_000;
  const mid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx  = (b[0] - a[0]) * (Math.PI / 180) * R * Math.cos(mid);
  const dy  = (b[1] - a[1]) * (Math.PI / 180) * R;
  const dz  = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const ROUTE_SEGS  = UMINEKO_ROUTE.map((p, i) =>
  routeSegLen(p, UMINEKO_ROUTE[(i + 1) % UMINEKO_ROUTE.length]),
);
const ROUTE_TOTAL = ROUTE_SEGS.reduce((s, l) => s + l, 0);
const LAP_SEC     = ROUTE_TOTAL / UMINEKO_SPEED;

function routePosition(elapsedSec: number): [number, number, number] {
  let dist = ((elapsedSec % LAP_SEC) / LAP_SEC) * ROUTE_TOTAL;
  for (let i = 0; i < UMINEKO_ROUTE.length; i++) {
    const len = ROUTE_SEGS[i];
    if (dist <= len) {
      const t = len > 0 ? dist / len : 0;
      const a = UMINEKO_ROUTE[i];
      const b = UMINEKO_ROUTE[(i + 1) % UMINEKO_ROUTE.length];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    dist -= len;
  }
  return UMINEKO_ROUTE[0];
}

let uminekoStartMs: number | null = null;
let currentUminekoPos: [number, number, number] = UMINEKO_ROUTE[0];

function startUminekoFlight(): void {
  uminekoStartMs = performance.now();
}

// Update audio position every render frame (synced to Cesium's render loop)
viewer.scene.postRender.addEventListener(() => {
  if (uminekoStartMs === null) return;
  currentUminekoPos = routePosition((performance.now() - uminekoStartMs) / 1000);
  audio.updateSoundPosition('umineko', currentUminekoPos);
});

// ── Cesium entities: sound markers + range rings ───────────────────────────

for (const def of SOUND_DEFS) {
  const [lng, lat, alt = 0] = def.position;
  const color    = Cesium.Color.fromCssColorString(def.color);
  const maxDist  = def.pannerOptions?.maxDistance ?? 100;
  const isMoving = def.id === 'umineko';

  // RELATIVE_TO_GROUND lets altitude take effect above the terrain surface.
  // CLAMP_TO_GROUND ignores altitude and always snaps to the surface.
  const heightRef = alt > 0
    ? Cesium.HeightReference.RELATIVE_TO_GROUND
    : Cesium.HeightReference.CLAMP_TO_GROUND;

  // Point marker with label.
  // Umineko uses CallbackPositionProperty so the entity follows the flight path.
  viewer.entities.add({
    position: isMoving
      ? new Cesium.CallbackPositionProperty(
          () => Cesium.Cartesian3.fromDegrees(...currentUminekoPos),
          false,
        )
      : Cesium.Cartesian3.fromDegrees(lng, lat, alt),
    point: {
      pixelSize: 12,
      color: color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      ...(isMoving ? {} : { heightReference: heightRef }),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: def.name,
      font: '14px "system-ui", sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      ...(isMoving ? {} : { heightReference: heightRef }),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  // Range ring — skip for the moving sound (position changes every frame)
  if (isMoving) continue;

  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
    ellipse: {
      semiMajorAxis: maxDist,
      semiMinorAxis: maxDist,
      material: color.withAlpha(0.08),
      outline: true,
      outlineColor: color.withAlpha(0.5),
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      classificationType: Cesium.ClassificationType.TERRAIN,
    },
  });
}

// ── Status panel ───────────────────────────────────────────────────────────

const stateEls = new Map<string, HTMLLIElement>();

function buildSoundList(): void {
  const list = document.getElementById('sound-list')!;
  for (const def of SOUND_DEFS) {
    const li = document.createElement('li');
    li.dataset['state'] = 'pending';
    li.textContent = def.name;
    stateEls.set(def.id, li);
    list.appendChild(li);
  }
}

function setState(id: unknown, state: string): void {
  const el = stateEls.get(id as string);
  if (el) el.dataset['state'] = state;
}

// ── Library events → status updates ───────────────────────────────────────

audio.on('soundLoaded',   (id) => setState(id, 'ready'));
audio.on('soundPlaying',  (id) => setState(id, 'playing'));
audio.on('soundPaused',   (id) => setState(id, 'paused'));
audio.on('soundStopped',  (id) => setState(id, 'stopped'));
audio.on('soundEnded',    (id) => setState(id, 'stopped'));
audio.on('soundCulled',   (id) => setState(id, 'culled'));
audio.on('soundUnculled', (id) => setState(id, 'playing'));
audio.on('soundError',    (id) => setState(id, 'error'));

// ── Altitude display ───────────────────────────────────────────────────────

const altEl = document.getElementById('altitude')!;

viewer.scene.postRender.addEventListener(() => {
  const height = Math.round(viewer.camera.positionCartographic.height);
  altEl.textContent = height.toLocaleString('ja-JP');
});

// ── Start button ───────────────────────────────────────────────────────────

const overlay  = document.getElementById('overlay')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = '読み込み中…';

  try {
    await audio.initialize();

    for (const def of SOUND_DEFS) {
      setState(def.id, 'loading');
      await audio.addSound(def);
    }

    overlay.classList.add('hidden');
    startUminekoFlight();
  } catch (err) {
    console.error('[demo-cesium] Audio init failed:', err);
    startBtn.disabled = false;
    startBtn.textContent = '再試行';
  }
});

// ── Init ───────────────────────────────────────────────────────────────────

buildSoundList();
