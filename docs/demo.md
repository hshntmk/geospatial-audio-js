# デモ解説

> `demo/` および `demo-cesium/` ディレクトリに含まれる動作サンプルの起動方法とコードの解説

---

## デモ一覧

| デモ | 地図ライブラリ | 起動コマンド |
|---|---|---|
| MapLibre デモ | MapLibre GL JS（2D/3D） | `npm run dev:demo` |
| Cesium デモ | CesiumJS（3D 地球儀） | `npm run dev:demo-cesium` |

---

## MapLibre デモ

### 起動方法

```bash
npm install
npm run dev:demo
```

ブラウザで `http://localhost:5173/` を開き、**「オーディオを開始」** ボタンをクリックしてください。

> **イヤホン推奨** — HRTF による立体音響の効果はイヤホンで最もよく体感できます。

### 操作方法

| 操作 | 内容 |
|---|---|
| `W` / `A` / `S` / `D` | 地図上を移動 |
| `Shift` + 上記 | 高速移動 |
| マウスドラッグ | 視点を回転 |
| スクロール | ズームイン / アウト |

### ディレクトリ構成

```
demo/
  index.html          — エントリーポイント（HTML）
  src/
    main.ts           — デモ本体（ライブラリの使用例）
    style.css         — UI スタイル
  vite.config.ts      — 開発サーバー設定
  public/
    audio/            — 音声ファイル（MP3）
```

---

## Cesium デモ

### 起動方法

```bash
npm install
npm run dev:demo-cesium
```

ブラウザで `http://localhost:5173/` を開き、**「オーディオを開始」** ボタンをクリックしてください。

> Cesium の全機能を利用する場合は [Cesium Ion](https://ion.cesium.com/) の無料アカウントで取得したアクセストークンが必要です。
> デモでは国土地理院（GSI）タイルを使用するためトークンなしで動作します。

### 操作方法

| 操作 | 内容 |
|---|---|
| 左ドラッグ | 視点を回転 |
| 右ドラッグ / 中ドラッグ | カメラを移動 |
| スクロール | 高度を変更（ズームイン / アウト） |

Cesium は 3D 地球儀のため、カメラの **高度・仰角・方位** がすべて音響定位に影響します。

### ディレクトリ構成

```
demo-cesium/
  index.html          — エントリーポイント（Cesium CDN 読み込みを含む）
  src/
    main.ts           — デモ本体
    style.css         — UI スタイル
  vite.config.ts      — 開発サーバー設定
                        （音声ファイルは demo/public/ を共有）
```

### Cesium の CDN 読み込みについて

デモは Cesium を CDN から `<script>` タグで読み込みます。これにより `window.Cesium`（= `globalThis.Cesium`）が自動的に設定されます。

`CesiumAdapter` には `viewer` と `Cesium` 名前空間を明示的に渡します。

```ts
import { GeospatialAudio, CesiumAdapter } from 'geospatial-audio-js';

// declare const Cesium: any; （CDN 経由で window.Cesium が設定されている）
const audio = new GeospatialAudio(
  new CesiumAdapter(viewer, Cesium),
  { distanceModel: 'inverse', panningModel: 'HRTF' },
);
```

ESM バンドラーで Cesium を `import * as Cesium from 'cesium'` する場合もそのまま渡せます。

---

## 共通: 画面構成

### ステータスパネル（右上）

各音源の現在の状態をリアルタイムで表示します。

| 表示色 | 状態 |
|---|---|
| 🟢 緑 | 再生中 |
| 🟡 黄 | 範囲外（カリングにより自動停止） |
| ⚫ グレー | 読み込み中 / 停止中 |
| 🔴 赤 | エラー |

### 音源の可視化

| デモ | 表示内容 |
|---|---|
| MapLibre | 橙色の円マーカー + 半透明のリング（GeoJSON レイヤー） |
| Cesium | 色付きポイント + ラベル + 半透明の楕円（Cesium Entity） |

---

## コード解説

### 1. GeospatialAudio の初期化

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

アダプターを明示的に生成して渡します。どちらのライブラリでも `GeospatialAudio` の API は同一です。

### 2. 音源の追加

```ts
await audio.addSound({
  id: 'wave',
  position: [139.052, 37.940],  // [経度, 緯度]
  url: 'audio/wave.mp3',
  loop: true,
  autoplay: true,
  pannerOptions: {
    refDistance: 10,            // この距離（m）で基準音量
    maxDistance: 100,           // PannerNode の最大距離
    rolloffFactor: 1.5,         // 距離減衰の速さ
  },
});
```

`addSound()` は音声ファイルを `fetch` してデコードし、PannerNode に接続するまでを非同期で行います。同じ URL は内部でキャッシュされます。

### 3. 初期化（AudioContext の解放）

```ts
startBtn.addEventListener('click', async () => {
  await audio.initialize(); // AudioContext の resume() + 地図との同期
  await audio.addSound(...);
});
```

ブラウザの Autoplay 制限により、`AudioContext` はユーザー操作後でないと動作しません。

### 4. イベントでステータス表示を更新

```ts
audio.on('soundPlaying',  (id) => setState(id, 'playing'));
audio.on('soundCulled',   (id) => setState(id, 'culled'));   // 範囲外に出た
audio.on('soundUnculled', (id) => setState(id, 'playing')); // 範囲内に戻った
audio.on('soundError',    (id) => setState(id, 'error'));
```

### 5. Cesium Entity への可視化

ライブラリは音響処理のみを担当します。Cesium の可視化は `viewer.entities.add()` で実装します。

```ts
viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
  point: {
    pixelSize: 12,
    color: Cesium.Color.fromCssColorString('#e85d04'),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
  label: { text: '🌊 波打ち際', ... },
});

// 聴取範囲のリング
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

## 音源一覧

デモ共通の音源とパラメータです。

| ID | 名前 | refDistance | maxDistance | rolloffFactor |
|---|---|---|---|---|
| `wave` | 🌊 波打ち際 | 10m | 100m | 1.5 |
| `aburazemi` | 🦗 アブラゼミ | 5m | 50m | 2.0 |
| `minminzemi` | 🦗 ミンミンゼミ | 10m | 50m | 2.0 |
| `umineko` | 🐦 ウミネコ | 10m | 100m | 1.0 |
| `baseball` | ⚾ 野球の音 | 10m | 100m | 1.0 |
| `intersection` | 🚦 交差点 | 10m | 100m | 1.5 |

- **refDistance** — この距離（m）で基準音量（1.0）になる
- **maxDistance** — この距離（m）を超えると音が聴こえなくなる（カリングも同値を使用）
- **rolloffFactor** — 値が大きいほど距離減衰が急峻になる

---

## 参考

- [Web Audio API — PannerNode（MDN）](https://developer.mozilla.org/ja/docs/Web/API/PannerNode)
