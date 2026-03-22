import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GeospatialAudio, MapLibreAdapter } from 'geospatial-audio-js';
import type { SoundConfig } from 'geospatial-audio-js';
import './style.css';

// ── Sound definitions ──────────────────────────────────────────────────────

interface SoundDef extends SoundConfig {
  name: string;
}

const SOUND_DEFS: SoundDef[] = [
  {
    id: 'wave',
    name: '🌊 波打ち際',
    position: [139.0527681367994, 37.940138058957864],
    url: 'audio/wave.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 100,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.5 },
  },
  {
    id: 'aburazemi',
    name: '🦗 アブラゼミ',
    position: [139.05414679993584, 37.940149770707585],
    url: 'audio/aburazemi.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 50,
    pannerOptions: { refDistance: 5, maxDistance: 50, rolloffFactor: 2 },
  },
  {
    id: 'minminzemi',
    name: '🦗 ミンミンゼミ',
    position: [139.0553913762711, 37.94057995593127],
    url: 'audio/minminzemi.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 50,
    pannerOptions: { refDistance: 10, maxDistance: 50, rolloffFactor: 2 },
  },
  {
    id: 'umineko',
    name: '🐦 ウミネコ',
    position: [139.05341141783293, 37.94063268576998],
    url: 'audio/umineko.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 100,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 10 },
  },
  {
    id: 'baseball',
    name: '⚾ 野球の音',
    position: [139.04832425986365, 37.93584061308863],
    url: 'audio/baseball.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 100,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.0 },
  },
  {
    id: 'intersection',
    name: '🚦 交差点',
    position: [139.05464460458862, 37.94057492970517],
    url: 'audio/intersection.mp3',
    loop: true,
    autoplay: true,
    maxDistance: 100,
    pannerOptions: { refDistance: 10, maxDistance: 100, rolloffFactor: 1.5 },
  },
];

// ── Map setup ──────────────────────────────────────────────────────────────

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
        tileSize: 256,
        attribution: '<a href="https://www.gsi.go.jp/" target="_blank">国土地理院</a>',
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  },
  center: [139.05379810679622, 37.94003763613765],
  zoom: 17,
  pitch: 45,
  bearing: 0,
});

// ── GeospatialAudio setup ──────────────────────────────────────────────────

const audio = new GeospatialAudio(new MapLibreAdapter(map), {
  distanceModel: 'inverse',
  panningModel: 'HRTF',
});

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
  } catch (err) {
    console.error('[demo] Audio init failed:', err);
    startBtn.disabled = false;
    startBtn.textContent = '再試行';
  }
});

// ── WASD movement ──────────────────────────────────────────────────────────

(function enableWASD() {
  const keys = new Set<string>();
  let rafId: number | null = null;

  const isTyping = (): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'shift'].includes(k)) {
      keys.add(k);
      e.preventDefault();
      if (!rafId) loop();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (!['w', 'a', 's', 'd'].some(k => keys.has(k))) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
  });

  function loop(): void {
    let vx = 0, vy = 0;
    if (keys.has('w')) vy += 1;
    if (keys.has('s')) vy -= 1;
    if (keys.has('a')) vx += 1;
    if (keys.has('d')) vx -= 1;

    if (vx === 0 && vy === 0) { rafId = null; return; }

    const len = Math.hypot(vx, vy);
    vx /= len; vy /= len;

    const speed = 6 * Math.max(0.5, Math.min(2, map.getZoom() / 12)) * (keys.has('shift') ? 2.5 : 1);
    map.panBy([-vx * speed, -vy * speed], { animate: false });
    rafId = requestAnimationFrame(loop);
  }
})();

// ── Map layers: sound markers + range rings ────────────────────────────────

/** Approximate a circle polygon as a GeoJSON ring. */
function circleRing(
  lng: number,
  lat: number,
  radiusMeters: number,
  steps = 48,
): [number, number][] {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat];
  });
}

map.on('load', () => {
  // ── Sound source point markers ──
  map.addSource('sounds', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: SOUND_DEFS.map(s => ({
        type: 'Feature',
        properties: { id: s.id, name: s.name },
        geometry: { type: 'Point', coordinates: [s.position[0], s.position[1]] },
      })),
    },
  });

  map.addLayer({
    id: 'sound-circles',
    type: 'circle',
    source: 'sounds',
    paint: {
      'circle-radius': 8,
      'circle-color': '#e85d04',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });

  map.addLayer({
    id: 'sound-labels',
    type: 'symbol',
    source: 'sounds',
    layout: {
      'text-field': ['get', 'name'],
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-font': ['Open Sans Regular'],
    },
    paint: {
      'text-color': '#111',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5,
    },
  });

  // ── maxDistance range rings ──
  const ringFeatures = SOUND_DEFS.flatMap(s => {
    const [lng, lat] = s.position;
    const maxDist = (s.pannerOptions?.maxDistance ?? s.maxDistance) ?? 100;
    return [
      {
        type: 'Feature' as const,
        properties: { id: s.id },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circleRing(lng, lat, maxDist)],
        },
      },
    ];
  });

  map.addSource('ranges', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: ringFeatures },
  });

  map.addLayer({
    id: 'range-fill',
    type: 'fill',
    source: 'ranges',
    paint: { 'fill-color': '#e85d04', 'fill-opacity': 0.06 },
  });

  map.addLayer({
    id: 'range-line',
    type: 'line',
    source: 'ranges',
    paint: { 'line-color': '#e85d04', 'line-opacity': 0.4, 'line-width': 1.5 },
  });
});

// ── Init ───────────────────────────────────────────────────────────────────

buildSoundList();
