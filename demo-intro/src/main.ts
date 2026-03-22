import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';
import type { SoundConfig } from 'geospatial-audio-js';
import './style.css';

// Cesium is loaded via CDN script tag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Cesium: any;

// ── Sound definitions ─────────────────────────────────────────────────────

const SOUND_DEFS: (SoundConfig & { name: string; color: string })[] = [
  {
    id: 'wave', name: '🌊 波打ち際', color: '#3B9BF4',
    position: [139.0527681367994, 37.940138058957864, 0],
    url: 'audio/wave.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 200, rolloffFactor: 1.5 },
  },
  {
    id: 'aburazemi', name: '🦗 アブラゼミ', color: '#06d6a0',
    position: [139.05414679993584, 37.940149770707585, 5],
    url: 'audio/aburazemi.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 5, maxDistance: 80, rolloffFactor: 2 },
  },
  {
    id: 'minminzemi', name: '🦗 ミンミンゼミ', color: '#ffd166',
    position: [139.0553913762711, 37.94057995593127, 12],
    url: 'audio/minminzemi.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 80, rolloffFactor: 2 },
  },
  {
    id: 'umineko', name: '🐦 ウミネコ', color: '#e85d04',
    position: [139.05341141783293, 37.94063268576998, 50],
    url: 'audio/umineko.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 300, rolloffFactor: 1.0 },
  },
  {
    id: 'baseball', name: '⚾ 野球の音', color: '#ef476f',
    position: [139.04832425986365, 37.93584061308863, 0],
    url: 'audio/baseball.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 150, rolloffFactor: 1.0 },
  },
  {
    id: 'intersection', name: '🚦 交差点', color: '#8338ec',
    position: [139.05464460458862, 37.94057492970517, 5],
    url: 'audio/intersection.mp3', loop: true, autoplay: true,
    pannerOptions: { refDistance: 10, maxDistance: 120, rolloffFactor: 1.5 },
  },
];

// ── Cesium Viewer ─────────────────────────────────────────────────────────

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
  baseLayerPicker: false, geocoder: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false,
  animation: false, timeline: false, infoBox: false,
  selectionIndicator: false, fullscreenButton: false,
});

// ── GeospatialAudio ───────────────────────────────────────────────────────

const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);

// ── Umineko flight route ──────────────────────────────────────────────────

const UMINEKO_ROUTE: [number, number, number][] = [
  [139.0534, 37.9428, 52], [139.0560, 37.9420, 58],
  [139.0575, 37.9406, 46], [139.0560, 37.9392, 52],
  [139.0534, 37.9384, 56], [139.0508, 37.9392, 44],
  [139.0492, 37.9406, 50], [139.0508, 37.9420, 54],
];
const UMINEKO_SPEED = 22;

function segLen(a: [number, number, number], b: [number, number, number]): number {
  const R = 6_371_000;
  const mid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * (Math.PI / 180) * R * Math.cos(mid);
  const dy = (b[1] - a[1]) * (Math.PI / 180) * R;
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const ROUTE_SEGS  = UMINEKO_ROUTE.map((p, i) => segLen(p, UMINEKO_ROUTE[(i + 1) % UMINEKO_ROUTE.length]));
const ROUTE_TOTAL = ROUTE_SEGS.reduce((s, l) => s + l, 0);
const LAP_SEC     = ROUTE_TOTAL / UMINEKO_SPEED;

function routePos(elapsedSec: number): [number, number, number] {
  let dist = ((elapsedSec % LAP_SEC) / LAP_SEC) * ROUTE_TOTAL;
  for (let i = 0; i < UMINEKO_ROUTE.length; i++) {
    const len = ROUTE_SEGS[i];
    if (dist <= len) {
      const t = len > 0 ? dist / len : 0;
      const a = UMINEKO_ROUTE[i], b = UMINEKO_ROUTE[(i + 1) % UMINEKO_ROUTE.length];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    dist -= len;
  }
  return UMINEKO_ROUTE[0];
}

let uminekoStartMs: number | null = null;
let currentUminekoPos: [number, number, number] = UMINEKO_ROUTE[0];

viewer.scene.postRender.addEventListener(() => {
  if (uminekoStartMs === null) return;
  currentUminekoPos = routePos((performance.now() - uminekoStartMs) / 1000);
  audio.updateSoundPosition('umineko', currentUminekoPos);
});

// ── Entities ──────────────────────────────────────────────────────────────

for (const def of SOUND_DEFS) {
  const [lng, lat, alt = 0] = def.position;
  const color    = Cesium.Color.fromCssColorString(def.color);
  const isMoving = def.id === 'umineko';
  const heightRef = alt > 0
    ? Cesium.HeightReference.RELATIVE_TO_GROUND
    : Cesium.HeightReference.CLAMP_TO_GROUND;

  viewer.entities.add({
    position: isMoving
      ? new Cesium.CallbackPositionProperty(
          () => Cesium.Cartesian3.fromDegrees(...currentUminekoPos), false,
        )
      : Cesium.Cartesian3.fromDegrees(lng, lat, alt),
    point: {
      pixelSize: 10, color,
      outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
      ...(isMoving ? {} : { heightReference: heightRef }),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: def.name, font: '13px "system-ui", sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -16),
      ...(isMoving ? {} : { heightReference: heightRef }),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  if (!isMoving) {
    const maxDist = def.pannerOptions?.maxDistance ?? 100;
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
      ellipse: {
        semiMajorAxis: maxDist, semiMinorAxis: maxDist,
        material: color.withAlpha(0.07),
        outline: true, outlineColor: color.withAlpha(0.4), outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
    });
  }
}

// ── Tour script ───────────────────────────────────────────────────────────

interface TourStep {
  title: string;
  subtitle: string;
  lng: number; lat: number; height: number;
  heading: number; pitch: number;
  flyDuration: number;
  pauseMs: number;
}

const TOUR: TourStep[] = [
  {
    title: '地図上に音が存在する',
    subtitle: '6つの音源がこのエリアに配置されています。カメラが近づくほど音が大きく聴こえます。',
    lng: 139.054, lat: 37.937, height: 750,
    heading: 0, pitch: -55,
    flyDuration: 0, pauseMs: 4500,
  },
  {
    title: '波打ち際に近づく',
    subtitle: '海岸へ降下します。波の音が大きくなり、左右からの聴こえ方が変わります。',
    lng: 139.0522, lat: 37.9400, height: 55,
    heading: 260, pitch: -12,
    flyDuration: 5, pauseMs: 4000,
  },
  {
    title: 'セミの声に包まれる',
    subtitle: 'アブラゼミとミンミンゼミが周囲の木々から聴こえます。左右・高さの違いを感じてください。',
    lng: 139.0547, lat: 37.9403, height: 18,
    heading: 80, pitch: -5,
    flyDuration: 4, pauseMs: 4500,
  },
  {
    title: 'ウミネコが上空を舞う',
    subtitle: '飛行中のウミネコは位置がリアルタイムに変化します。音が頭上を通り過ぎるのを感じてください。',
    lng: 139.0534, lat: 37.9412, height: 28,
    heading: 0, pitch: 18,
    flyDuration: 3, pauseMs: 5500,
  },
  {
    title: '交差点の喧騒',
    subtitle: '都市の音源へ。信号のそばを通り過ぎると音が横に流れていきます。',
    lng: 139.0546, lat: 37.9407, height: 14,
    heading: 175, pitch: -8,
    flyDuration: 4, pauseMs: 4000,
  },
  {
    title: '空間音響をOFFにしてみると…',
    subtitle: '右上のボタンで空間音響のON/OFFを切り替えてみてください。音の立体感が消えます。',
    lng: 139.054, lat: 37.940, height: 380,
    heading: 0, pitch: -42,
    flyDuration: 5, pauseMs: 6000,
  },
];

// ── Tour logic ────────────────────────────────────────────────────────────

const tourCard     = document.getElementById('tour-card')!;
const tourLabel    = document.getElementById('tour-step-label')!;
const tourTitle    = document.getElementById('tour-title')!;
const tourSubtitle = document.getElementById('tour-subtitle')!;
const tourDots     = document.getElementById('tour-dots')!;
const skipBtn      = document.getElementById('skip-btn')!;
const spatialBtn   = document.getElementById('spatial-btn')!;
const manualHint   = document.getElementById('manual-hint')!;

TOUR.forEach(() => {
  const dot = document.createElement('span');
  dot.className = 'dot';
  tourDots.appendChild(dot);
});

function showStep(i: number): void {
  const step = TOUR[i];
  tourLabel.textContent    = `STEP ${i + 1} / ${TOUR.length}`;
  tourTitle.textContent    = step.title;
  tourSubtitle.textContent = step.subtitle;
  [...tourDots.children].forEach((dot, j) => {
    dot.className = 'dot' + (j === i ? ' active' : j < i ? ' done' : '');
  });
  // Show spatial toggle at the comparison step
  if (i === 5) spatialBtn.classList.remove('hidden');
}

function flyTo(step: TourStep): Promise<void> {
  return new Promise(resolve => {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(step.lng, step.lat, step.height),
      orientation: {
        heading: Cesium.Math.toRadians(step.heading),
        pitch:   Cesium.Math.toRadians(step.pitch),
        roll:    0,
      },
      duration: step.flyDuration,
      complete: resolve,
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let tourRunning = false;

async function runTour(): Promise<void> {
  tourRunning = true;
  viewer.scene.screenSpaceCameraController.enableInputs = false;
  tourCard.classList.remove('hidden');

  // First step: set position immediately
  const first = TOUR[0];
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(first.lng, first.lat, first.height),
    orientation: {
      heading: Cesium.Math.toRadians(first.heading),
      pitch:   Cesium.Math.toRadians(first.pitch),
      roll: 0,
    },
  });

  for (let i = 0; i < TOUR.length; i++) {
    if (!tourRunning) break;
    showStep(i);
    if (i > 0) await flyTo(TOUR[i]);
    await sleep(TOUR[i].pauseMs);
  }

  enterManualMode();
}

function enterManualMode(): void {
  tourRunning = false;
  viewer.scene.screenSpaceCameraController.enableInputs = true;
  tourCard.classList.add('hidden');
  skipBtn.removeEventListener('click', onSkip);
  spatialBtn.classList.remove('hidden');
  manualHint.classList.remove('hidden');
}

function onSkip(): void { enterManualMode(); }
skipBtn.addEventListener('click', onSkip);

// ── Spatial ON/OFF toggle ─────────────────────────────────────────────────

// When OFF: compress all positions to near-zero → HRTF has no angular info → sounds from center
let spatialOn = true;

spatialBtn.addEventListener('click', () => {
  spatialOn = !spatialOn;
  audio.setScale({
    horizontal: spatialOn ? 1.0 : 0.0001,
    vertical:   spatialOn ? 1.0 : 0.0001,
  });
  spatialBtn.textContent    = spatialOn ? '🔊 空間音響: ON' : '🔈 空間音響: OFF';
  spatialBtn.dataset['on']  = String(spatialOn);
});

// ── Start button ──────────────────────────────────────────────────────────

const startOverlay = document.getElementById('start-overlay')!;
const startBtn     = document.getElementById('start-btn') as HTMLButtonElement;

startBtn.addEventListener('click', async () => {
  startBtn.disabled    = true;
  startBtn.textContent = '読み込み中…';

  try {
    await audio.initialize();

    for (const def of SOUND_DEFS) {
      await audio.addSound(def);
    }

    startOverlay.classList.add('hidden');
    uminekoStartMs = performance.now();
    await runTour();
  } catch (err) {
    console.error('[demo-intro]', err);
    startBtn.disabled    = false;
    startBtn.textContent = 'もう一度試す';
  }
});
