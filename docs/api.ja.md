# API リファレンス

> `GeospatialAudio` クラスの全パブリックメソッドと型定義

---

## 目次

1. [コンストラクタ](#コンストラクタ)
2. [ライフサイクル](#ライフサイクル)
3. [音源管理](#音源管理)
4. [リスナー管理](#リスナー管理)
5. [リバーブ](#リバーブ)
6. [マスターボリューム](#マスターボリューム)
7. [パフォーマンス最適化](#パフォーマンス最適化)
8. [スケール調整](#スケール調整)
9. [デバッグ](#デバッグ)
10. [ログ](#ログ)
11. [イベント](#イベント)
12. [型定義](#型定義)

---

## コンストラクタ

```ts
new GeospatialAudio(adapter: MapAdapter, options?: GeospatialAudioOptions)
```

| 引数 | 型 | 説明 |
|---|---|---|
| `adapter` | `MapAdapter` | 地図ライブラリ用アダプターのインスタンス |
| `options` | `GeospatialAudioOptions` | 任意。グローバルな音響パラメータ |

アダプターを明示的に生成して渡します。各アダプタークラスは `geospatial-audio-js` からインポートできます。

```ts
import { GeospatialAudio, MapLibreAdapter, LeafletAdapter, CesiumAdapter } from 'geospatial-audio-js';

// MapLibre
const audio = new GeospatialAudio(new MapLibreAdapter(map));

// Leaflet
const audio = new GeospatialAudio(new LeafletAdapter(leafletMap));

// Cesium
const audio = new GeospatialAudio(new CesiumAdapter(viewer, Cesium));
```

### GeospatialAudioOptions

```ts
interface GeospatialAudioOptions {
  distanceModel?: 'linear' | 'inverse' | 'exponential'; // デフォルト: 'inverse'
  refDistance?:   number;  // デフォルト: 5
  maxDistance?:   number;  // デフォルト: 10000
  rolloffFactor?: number;  // デフォルト: 1
  panningModel?:  'HRTF' | 'equalpower'; // デフォルト: 'HRTF'
}
```

---

## ライフサイクル

### `initialize(): Promise<void>`

AudioContext を resume してリスナーと音源の初期同期を行います。ブラウザの Autoplay ポリシーにより、**必ずユーザー操作のハンドラ内で呼ぶ**必要があります。

```ts
button.addEventListener('click', async () => {
  await audio.initialize();
});
```

### `dispose(): void`

全音源・AudioContext・イベントリスナーを解放します。ページ離脱時に呼んでください。

```ts
window.addEventListener('beforeunload', () => audio.dispose());
```

### `checkAutoplaySupport(): Promise<boolean>`

AudioContext が `running` 状態かどうかを返します。ユーザー操作前は `false` になります。

---

## 音源管理

### `addSound(config: SoundConfig): Promise<void>`

音声ファイルを fetch・デコードして音源を追加します。同じ URL は内部でキャッシュされます。

```ts
await audio.addSound({
  id: 'bell',
  position: [139.691, 35.691],       // [経度, 緯度]
  url: 'audio/bell.mp3',
  loop: true,
  autoplay: true,
  pannerOptions: {
    refDistance:   10,
    maxDistance:   200,
    rolloffFactor: 1.5,
  },
});
```

#### SoundConfig

```ts
interface SoundConfig {
  id:            string;
  position:      [number, number, number?];  // [経度, 緯度, 高度(m)?]
  url:           string;
  loop?:         boolean;                    // デフォルト: false
  volume?:       number;                     // 0–1、デフォルト: 1.0
  autoplay?:     boolean;                    // initialize() 後に自動再生
  maxDistance?:  number;                     // カリング距離（m）。未指定は cullingDistance を使用
  pannerOptions?: SoundPannerOptions;
}
```

#### SoundPannerOptions

```ts
interface SoundPannerOptions {
  panningModel?:  'HRTF' | 'equalpower';
  distanceModel?: 'linear' | 'inverse' | 'exponential';
  refDistance?:   number;   // この距離(m)で基準音量(1.0)
  maxDistance?:   number;   // PannerNode の最大距離(m)
  rolloffFactor?: number;   // 距離減衰係数（大きいほど急峻）
  coneInnerAngle?: number;  // 指向性: 内側コーン角度(度)
  coneOuterAngle?: number;  // 指向性: 外側コーン角度(度)
  coneOuterGain?:  number;  // 指向性: 外側コーンのゲイン
}
```

---

### `removeSound(id: string): void`

音源を停止・削除します。

### `playSound(id: string): void`

音源を再生します。

### `pauseSound(id: string): void`

音源を一時停止します。

### `stopSound(id: string): void`

音源を停止（再生位置をリセット）します。

### `setVolume(id: string, volume: number): void`

音源の音量を変更します（`0.0`–`1.0`）。

### `getVolume(id: string): number`

現在の音量を返します。

### `getSoundState(id: string): SoundState | undefined`

音源の状態を返します。音源が存在しない場合は `undefined`。

```ts
type SoundState = 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';
```

### `updateSoundPosition(id: string, position: [number, number, number?]): void`

移動する音源の位置をリアルタイムで更新します。

```ts
// 飛行中のドローン音源の追跡
audio.updateSoundPosition('drone', [newLng, newLat, altitude]);
```

---

## リスナー管理

### `syncWithMap(enabled: boolean): void`

地図カメラとの自動同期を有効／無効にします。デフォルトは有効（`true`）。

### `setListenerPosition(position: [number, number, number?]): void`

リスナーの地理的位置を手動で設定します。呼び出すと自動同期が無効になります。

```ts
audio.setListenerPosition([139.69, 35.69, 0]);
```

### `setListenerOrientation(bearing: number, pitch: number, roll?: number): void`

リスナーの向きを手動で設定します。呼び出すと自動同期が無効になります。

| 引数 | 説明 |
|---|---|
| `bearing` | 方位角（度）: 0=北、90=東、180=南、270=西 |
| `pitch` | 仰角（度）: 0=水平、正=上向き |
| `roll` | ロール（度）: 省略可 |

### `getListenerInfo(): ListenerInfo`

現在のリスナー情報を返します。

```ts
interface ListenerInfo {
  position:    { lng: number; lat: number; alt?: number };
  orientation: { bearing: number; pitch: number; roll: number };
  autoSync:    boolean;
}
```

---

## リバーブ

### `setReverb(config: ReverbConfig): void`

リバーブエフェクトを設定します。`enabled: false` を渡すと `disableReverb()` と同等です。

```ts
// プリセットを使う
audio.setReverb({
  enabled: true,
  type: 'room',   // 'room' | 'hall' | 'outdoor'
  wet: 0.3,       // リバーブ成分 0–1（デフォルト: 0.3）
  dry: 1.0,       // 直接音 0–1（デフォルト: 1.0）
});

// decay を直接指定（type より優先）
audio.setReverb({ enabled: true, decay: 2.5, wet: 0.4, dry: 0.8 });

// カスタムインパルス応答（AudioBuffer）を使う
audio.setReverb({ enabled: true, customIR: myIRBuffer, wet: 0.5 });
```

#### ReverbConfig

```ts
interface ReverbConfig {
  enabled:    boolean;
  type?:      'room' | 'hall' | 'outdoor'; // プリセット
  decay?:     number;      // 残響時間(秒)。type より優先
  wet?:       number;      // リバーブ成分 0–1（デフォルト: 0.3）
  dry?:       number;      // 直接音 0–1（デフォルト: 1.0）
  customIR?:  AudioBuffer; // カスタムインパルス応答
}
```

#### プリセット特性

| `type` | `decay` | 用途 |
|---|---|---|
| `'room'` | 1.0 秒 | 室内・建物 |
| `'hall'` | 3.0 秒 | コンサートホール・大空間 |
| `'outdoor'` | 0.4 秒 | 屋外（最小限の反射） |

> **仕組み:** アルゴリズムによるインパルス応答生成（白色雑音 × 指数減衰）を使用します。外部 IR ファイルは不要です。

#### 内部オーディオグラフ（リバーブ有効時）

```
masterGain ─┬─ dryGain ─────────────── destination
             └─ reverbGain ─ convolver ─ destination
```

### `disableReverb(): void`

リバーブを無効化してオーディオグラフを元に戻します。

---

## マスターボリューム

### `setMasterVolume(volume: number): void`

全音源に適用されるマスターボリュームを設定します（`0.0`–`1.0`、範囲外はクランプ）。

```ts
audio.setMasterVolume(0.8);
```

---

## パフォーマンス最適化

### `setOptimization(config: Partial<OptimizationConfig>): void`

カリングや同時再生数の上限を設定します。

```ts
audio.setOptimization({
  maxActiveSounds: 10,    // 同時再生数の上限（デフォルト: 10）
  cullingDistance: 5000,  // この距離(m)以上の音源を自動停止（デフォルト: 5000）
  updateInterval:  100,   // カリング更新間隔(ms)（デフォルト: 100）
});
```

```ts
interface OptimizationConfig {
  maxActiveSounds?: number; // デフォルト: 10
  cullingDistance?: number; // デフォルト: 5000
  updateInterval?:  number; // デフォルト: 100
  priorityMode?:    'distance' | 'volume' | 'custom'; // デフォルト: 'distance'
}
```

カリングされた音源は `soundCulled` イベントで通知され、範囲内に戻ると自動再開（`soundUnculled`）します。

---

## スケール調整

### `setScale(scale: ScaleConfig): void`

地理距離→音響距離のスケールを調整します。

```ts
audio.setScale({
  horizontal: 1.0, // 水平方向（経緯度）のスケール
  vertical:   1.0, // 垂直方向（高度）のスケール
  global:     1.0, // 全体スケール
});
```

> **用途例:** 広大なエリア（数 km）の音源を聴こえやすくしたい場合に `horizontal` を大きくします。

---

## デバッグ

### `enableDebug(config: DebugConfig): void`

デバッグモードを有効にします。

```ts
audio.enableDebug({
  logAudioParams:  true, // 音源位置更新のたびに PannerNode パラメータをコンソールへ出力
  logPerformance:  true, // カリング処理時間をコンソールへ出力
});
```

```ts
interface DebugConfig {
  logAudioParams?:  boolean;
  logPerformance?:  boolean;
}
```

### `disableDebug(): void`

デバッグモードを無効にします。

### `getDebugInfo(): DebugInfo`

現在の音響状態のスナップショットを返します。

```ts
const info = audio.getDebugInfo();
console.log(info);
// {
//   activeSounds: 3,
//   totalSounds:  6,
//   culledSounds: 2,
//   audioContext: { state: 'running', sampleRate: 48000, currentTime: 12.5 },
//   sounds: [
//     {
//       id:                 'wave',
//       state:              'playing',
//       geoPosition:        { lng: 139.052, lat: 37.940, alt: 0 },
//       audioPosition:      { x: -12.3, y: -500, z: 8.7 },
//       volume:             0.8,
//       distanceFromListener: 501.4
//     },
//     ...
//   ]
// }
```

```ts
interface DebugInfo {
  activeSounds: number;
  totalSounds:  number;
  culledSounds: number;
  audioContext: { state: string; sampleRate: number; currentTime: number };
  sounds:       SoundDebugInfo[];
}

interface SoundDebugInfo {
  id:                   string;
  state:                SoundState;
  geoPosition:          { lng: number; lat: number; alt?: number };
  audioPosition:        { x: number; y: number; z: number };
  volume:               number;
  distanceFromListener: number;
}
```

---

## ログ

### `setLogLevel(level: LogLevel): void`

ライブラリ内部のログ出力レベルを設定します。

```ts
audio.setLogLevel('debug'); // 最も詳細
audio.setLogLevel('info');  // デフォルト
audio.setLogLevel('warn');
audio.setLogLevel('error');
audio.setLogLevel('none');  // 無効
```

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';
```

---

## イベント

### `on(event: string, handler: (...args: unknown[]) => void): void`

イベントリスナーを登録します。

### `off(event: string, handler: (...args: unknown[]) => void): void`

イベントリスナーを削除します。

### `removeAllListeners(event?: string): void`

全リスナーを削除します。`event` を指定するとそのイベントのみ削除します。

### イベント一覧

```ts
// 音源イベント
audio.on('soundLoaded',   (id: string) => {});              // fetch・デコード完了
audio.on('soundPlaying',  (id: string) => {});              // 再生開始
audio.on('soundPaused',   (id: string) => {});              // 一時停止
audio.on('soundStopped',  (id: string) => {});              // 停止
audio.on('soundEnded',    (id: string) => {});              // ループなし音源が最後まで再生
audio.on('soundCulled',   (id: string) => {});              // 距離カリングにより自動停止
audio.on('soundUnculled', (id: string) => {});              // 範囲内に戻り自動再開
audio.on('soundError',    (id: string, err: Error) => {});  // ロード／再生エラー

// リスナーイベント
audio.on('listenerMoved',   (pos: Position) => {});
audio.on('listenerRotated', (bearing: number, pitch: number) => {});

// システムイベント
audio.on('initialized', () => {});
audio.on('disposed',    () => {});
```

---

## 型定義

### 座標

```ts
/** 地理座標 */
interface Position {
  lng: number;   // 経度
  lat: number;   // 緯度
  alt?: number;  // 高度(m)、省略可
}

/** 3D ベクトル（音響座標系） */
interface Vector3 { x: number; y: number; z: number; }

/** カメラ向き */
interface Orientation { bearing: number; pitch: number; roll: number; }
```

### アダプター

```ts
/** 対応する地図イベントの種別 */
type MapEvent = 'move' | 'rotate' | 'zoom' | 'pitch';

interface MapAdapter {
  getCenter(): Position;
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getRoll?(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: { x: number; y: number }): [number, number];
  on(event: MapEvent, handler: () => void): void;
  off(event: MapEvent, handler: () => void): void;
  getMetersPerPixel(lat: number, zoom: number): number;
  getLibraryName(): string;
}
```

### エクスポート一覧

```ts
// クラス
export { GeospatialAudio } from 'geospatial-audio-js';
export { MapLibreAdapter } from 'geospatial-audio-js';
export { LeafletAdapter }  from 'geospatial-audio-js';
export { CesiumAdapter }   from 'geospatial-audio-js';
// 型
export type {
  GeospatialAudioOptions,
  SoundConfig, SoundState, SoundPannerOptions, SoundInfo,
  Position, Vector3, Orientation,
  ListenerInfo,
  ScaleConfig, OptimizationConfig,
  LogLevel, PanningModelType, DistanceModelType,
  ReverbConfig, ReverbPreset,
  DebugConfig, DebugInfo, SoundDebugInfo,
  MapAdapter, MapEvent,
} from 'geospatial-audio-js';
```
