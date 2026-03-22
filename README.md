# geospatial-audio-js

Web地図ライブラリに3D音響機能を追加する汎用JavaScriptライブラリ。

地図上の地理座標を持つ音源を、Web Audio API の `PannerNode` を使って3D空間に配置します。地図の移動・回転・ピッチに合わせてリスナーの向きを自動同期し、リアルな立体音響体験を実現します。

## 特徴

- **地図ライブラリ非依存** — アダプターパターンで MapLibre GL JS・Leaflet・Cesium に対応
- **Web Audio API ベース** — HRTF による高品質な3D音響
- **リバーブ** — 部屋・ホール・屋外プリセット、またはカスタム IR による環境音響
- **距離カリング** — 指定距離以上の音源を自動停止・再開
- **デバッグ支援** — `getDebugInfo()` でリアルタイムな音響状態スナップショットを取得
- **TypeScript 完全対応** — 型定義同梱
- **軽量** — ES Module / UMD 両対応、Tree-shakeable

## インストール

```bash
npm install geospatial-audio-js
```

地図ライブラリに応じて必要なパッケージを追加してください:

```bash
# MapLibre GL JS
npm install geospatial-audio-js maplibre-gl

# Leaflet
npm install geospatial-audio-js leaflet

# Cesium
npm install geospatial-audio-js cesium
```

## クイックスタート

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

// AudioContext はユーザー操作後に解放される
document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();

  await audio.addSound({
    id: 'birds',
    position: [139.691, 35.691], // [longitude, latitude]
    url: 'audio/birds.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: {
      refDistance: 10,    // この距離（m）で基準音量
      maxDistance: 200,   // この距離（m）以上では聴こえなくなる
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

地図を移動するだけで音源との距離・方向が変わり、3D音響が追従します。

## 主なAPI

### 音源管理

```ts
// 追加（非同期 — 音声ファイルを fetch してデコード）
await audio.addSound({ id, position, url, loop, volume, autoplay, pannerOptions });

// 制御
audio.playSound('id');
audio.pauseSound('id');
audio.stopSound('id');
audio.setVolume('id', 0.5);
audio.removeSound('id');

// 位置更新（移動する音源向け）
audio.updateSoundPosition('id', [lng, lat, altitude]);
```

### リスナー（カメラ）管理

```ts
// 地図カメラとの自動同期（デフォルト有効）
audio.syncWithMap(true);

// 手動で位置・向きを設定
audio.setListenerPosition([lng, lat, altitude]);
audio.setListenerOrientation(bearing, pitch, roll);
```

### リバーブ（環境音響）

```ts
// プリセットを使う
audio.setReverb({
  enabled: true,
  type: 'room',   // 'room' | 'hall' | 'outdoor'
  wet: 0.3,
  dry: 0.7,
});

// リバーブを無効化
audio.disableReverb();
```

### マスターボリューム

```ts
audio.setMasterVolume(0.8); // 0.0 〜 1.0
```

### パフォーマンス最適化

```ts
audio.setOptimization({
  maxActiveSounds: 10,    // 同時再生数の上限
  cullingDistance: 5000,  // この距離（m）以上の音源を自動停止
  updateInterval: 100,    // カリング更新間隔（ms）
});
```

### デバッグ

```ts
// デバッグモードを有効化（コンソールへのログ出力）
audio.enableDebug({ logAudioParams: true, logPerformance: true });

// 現在の音響状態スナップショットを取得
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

### イベント

```ts
audio.on('soundLoaded',   (id) => console.log(`${id} loaded`));
audio.on('soundPlaying',  (id) => { /* ... */ });
audio.on('soundCulled',   (id) => console.log(`${id} is too far`));
audio.on('soundUnculled', (id) => console.log(`${id} is in range again`));
audio.on('soundError',    (id, err) => console.error(err));
```

### ライフサイクル

```ts
// 初期化（ユーザー操作後に呼ぶ）
await audio.initialize();

// 後片付け
audio.dispose();
```

## デモ

実際の動作はデモで確認できます。詳細は [docs/demo.md](docs/demo.md) を参照してください。

| デモ | 起動コマンド |
|---|---|
| MapLibre GL JS（2D/3D） | `npm run dev:demo` |
| CesiumJS（3D 地球儀） | `npm run dev:demo-cesium` |

```bash
# MapLibre デモ
npm run dev:demo

# Cesium デモ
npm run dev:demo-cesium
```

いずれも `http://localhost:5173/` で確認できます。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/api.md](docs/api.md) | **APIリファレンス**（全メソッド・型定義） |
| [docs/demo.md](docs/demo.md) | デモの起動・解説 |

## 対応ブラウザ

Web Audio API (`PannerNode`) に対応した以下のブラウザ:

- Chrome / Edge 最新版
- Firefox 最新版
- Safari 最新版（iOS 14+）

## 対応地図ライブラリ

| ライブラリ | 状況 |
|---|---|
| MapLibre GL JS | ✅ 対応済み |
| Leaflet | ✅ 対応済み |
| Cesium | ✅ 対応済み |
| Google Maps | 🔜 Phase 3 予定 |

## ライセンス

MIT
