import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';
import './style.css';

// Cesium is loaded via CDN script tag — sets window.Cesium (globalThis.Cesium).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Cesium: any;

// Audio assets are the demo-shared files (served from demo/public via vite).
const SOUND_ID = 'source';

// ── Geometry: a straight E–W flight line through the centre ──────────────────

const CENTER_LNG = 139.05379810679622;
const CENTER_LAT = 37.94003763613765;
const R = 6_371_000;
const HALF_LEN = 1_000; // metres each side of centre

const M_PER_DEG_LNG = (Math.PI / 180) * R * Math.cos((CENTER_LAT * Math.PI) / 180);
const HALF_DEG = HALF_LEN / M_PER_DEG_LNG;

const WEST_LNG = CENTER_LNG - HALF_DEG;
const EAST_LNG = CENTER_LNG + HALF_DEG;

/** Convert an along-axis offset in metres (−HALF_LEN..+HALF_LEN) to lng. */
function offsetToLng(m: number): number {
  return CENTER_LNG + m / M_PER_DEG_LNG;
}

// ── Cesium viewer ────────────────────────────────────────────────────────────

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
      credit: '<a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
      minimumLevel: 2,
      maximumLevel: 18,
    }),
  ),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
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

// Low oblique view so the source passes close in front of the listener (camera).
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(CENTER_LNG, CENTER_LAT - 0.0016, 140),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch:   Cesium.Math.toRadians(-18),
    roll:    0,
  },
});

// ── GeospatialAudio ──────────────────────────────────────────────────────────

const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);

// Keep the source audible across the whole 1 km line (don't let culling stop it).
audio.setOptimization({ cullingDistance: 5_000 });

// ── Moving source state ──────────────────────────────────────────────────────

let speed = 60;            // m/s (slider)
let dopplerFactor = 1.0;   // (slider)
let dopplerOn = true;      // (checkbox)
let listenerMotion = false; // (checkbox) — camera movement does NOT shift pitch by default

let posMeters = -HALF_LEN; // along-axis position
let dir = 1;               // +1 = eastbound, −1 = westbound
let lastFrameMs: number | null = null;
let currentPos: [number, number, number] = [WEST_LNG, CENTER_LAT, 0];

function advance(nowMs: number): void {
  if (lastFrameMs === null) { lastFrameMs = nowMs; return; }
  const dt = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;

  posMeters += dir * speed * dt;
  if (posMeters >= HALF_LEN) { posMeters = HALF_LEN; dir = -1; }
  else if (posMeters <= -HALF_LEN) { posMeters = -HALF_LEN; dir = 1; }

  currentPos = [offsetToLng(posMeters), CENTER_LAT, 0];
  audio.updateSoundPosition(SOUND_ID, currentPos);
}

// ── Entities: flight line + moving marker ────────────────────────────────────

viewer.entities.add({
  polyline: {
    positions: Cesium.Cartesian3.fromDegreesArray([WEST_LNG, CENTER_LAT, EAST_LNG, CENTER_LAT]),
    width: 2,
    material: new Cesium.PolylineDashMaterialProperty({
      color: Cesium.Color.fromCssColorString('#ffd166'),
    }),
    clampToGround: true,
  },
});

viewer.entities.add({
  position: new Cesium.CallbackPositionProperty(
    () => Cesium.Cartesian3.fromDegrees(...currentPos),
    false,
  ),
  point: {
    pixelSize: 16,
    color: Cesium.Color.fromCssColorString('#ef476f'),
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  },
  label: {
    text: '🔊',
    font: '20px sans-serif',
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -16),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  },
});

// ── HUD: distance / radial velocity / pitch ratio ────────────────────────────
// These mirror what DopplerController computes, for on-screen feedback.

const C = 343.3;
const distEl  = document.getElementById('r-dist')!;
const velEl   = document.getElementById('r-vel')!;
const ratioEl = document.getElementById('r-ratio')!;
const arrowEl = document.getElementById('r-arrow')!;

let lastDist: number | null = null;
let lastDistMs: number | null = null;
let prevSource: [number, number, number] | null = null;
let smoothVel = 0;

/** Source-only radial velocity (mirrors DopplerController.sourceRadialVelocity). */
function sourceRadial(
  listener: { lng: number; lat: number; alt: number },
  prev: [number, number, number],
  cur: [number, number, number],
  dt: number,
): number {
  const k = (Math.PI / 180) * R;
  const cosLat = Math.cos((listener.lat * Math.PI) / 180);
  const vE = ((cur[0] - prev[0]) * k * cosLat) / dt;
  const vN = ((cur[1] - prev[1]) * k) / dt;
  const vU = ((cur[2] ?? 0) - (prev[2] ?? 0)) / dt;
  const dE = (cur[0] - listener.lng) * k * cosLat;
  const dN = (cur[1] - listener.lat) * k;
  const dU = (cur[2] ?? 0) - listener.alt;
  const len = Math.hypot(dE, dN, dU);
  return len < 1e-3 ? 0 : (vE * dE + vN * dN + vU * dU) / len;
}

function listenerGeo(): { lng: number; lat: number; alt: number } {
  const c = viewer.camera.positionCartographic;
  return {
    lng: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
    alt: c.height,
  };
}

function haversine(a: { lng: number; lat: number; alt: number }, b: [number, number, number]): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a.lat) * Math.PI) / 180;
  const dLng = ((b[0] - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const surface = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const dAlt = (b[2] ?? 0) - a.alt;
  return Math.sqrt(surface ** 2 + dAlt ** 2);
}

function updateHud(nowMs: number): void {
  const lg = listenerGeo();
  const dist = haversine(lg, currentPos);

  if (lastDistMs !== null) {
    const dt = (nowMs - lastDistMs) / 1000;
    if (dt > 0) {
      // Match the active mode: total distance change vs source motion only.
      const vel = listenerMotion
        ? (dist - (lastDist ?? dist)) / dt
        : sourceRadial(lg, prevSource ?? currentPos, currentPos, dt);
      smoothVel += (vel - smoothVel) * 0.2; // light smoothing for readability
    }
  }
  lastDist = dist;
  lastDistMs = nowMs;
  prevSource = currentPos;

  const ratioRaw = C / (C + dopplerFactor * smoothVel);
  const ratio = dopplerOn ? Math.max(0.5, Math.min(2, ratioRaw)) : 1;

  distEl.textContent  = Math.round(dist).toLocaleString('ja-JP');
  velEl.textContent   = smoothVel.toFixed(1);
  ratioEl.textContent = `×${ratio.toFixed(2)}`;
  arrowEl.textContent = !dopplerOn ? '' : smoothVel < -0.5 ? '↑ 接近' : smoothVel > 0.5 ? '↓ 離脱' : '—';
  ratioEl.style.color = ratio > 1.01 ? '#ef476f' : ratio < 0.99 ? '#3B9BF4' : '#444';
}

// ── Per-frame loop ───────────────────────────────────────────────────────────

let running = false;
viewer.scene.postRender.addEventListener(() => {
  if (!running) return;
  const now = performance.now();
  advance(now);
  updateHud(now);
});

// ── Controls ─────────────────────────────────────────────────────────────────

const speedSlider  = document.getElementById('speed') as HTMLInputElement;
const speedVal     = document.getElementById('speed-val')!;
const factorSlider = document.getElementById('factor') as HTMLInputElement;
const factorVal    = document.getElementById('factor-val')!;
const toggle       = document.getElementById('doppler-toggle') as HTMLInputElement;
const listenerToggle = document.getElementById('listener-motion-toggle') as HTMLInputElement;
const soundSelect  = document.getElementById('sound-select') as HTMLSelectElement;

function applyDoppler(): void {
  audio.setDopplerEffect(
    dopplerOn ? { enabled: true, dopplerFactor, listenerMotion } : { enabled: false },
  );
}

/** (Re)loads the moving source with the currently selected audio file. */
let loadToken = 0;
async function loadSource(): Promise<void> {
  const token = ++loadToken;
  if (audio.getSoundState(SOUND_ID) !== undefined) audio.removeSound(SOUND_ID);

  await audio.addSound({
    id: SOUND_ID,
    position: currentPos,
    url: `audio/${soundSelect.value}`,
    loop: true,
    autoplay: true,
    pannerOptions: { refDistance: 80, maxDistance: 2_500, rolloffFactor: 0.8 },
  });

  // A newer selection superseded this load — drop the stale one.
  if (token !== loadToken) audio.removeSound(SOUND_ID);
}

soundSelect.addEventListener('change', () => {
  if (running) void loadSource();
});

speedSlider.addEventListener('input', () => {
  speed = Number(speedSlider.value);
  speedVal.textContent = speedSlider.value;
});
factorSlider.addEventListener('input', () => {
  dopplerFactor = Number(factorSlider.value);
  factorVal.textContent = dopplerFactor.toFixed(1);
  if (running) applyDoppler();
});
toggle.addEventListener('change', () => {
  dopplerOn = toggle.checked;
  if (running) applyDoppler();
});
listenerToggle.addEventListener('change', () => {
  listenerMotion = listenerToggle.checked;
  if (running) applyDoppler();
});

// ── Start ────────────────────────────────────────────────────────────────────

const overlay  = document.getElementById('overlay')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = '読み込み中…';

  try {
    await audio.initialize();
    await loadSource();

    applyDoppler();
    running = true;
    overlay.classList.add('hidden');
  } catch (err) {
    console.error('[demo-doppler] init failed:', err);
    startBtn.disabled = false;
    startBtn.textContent = '再試行';
  }
});