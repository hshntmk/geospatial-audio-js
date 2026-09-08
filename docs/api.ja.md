# API リファレンス

> `GeospatialAudio` クラスの全パブリックメソッドと型定義

---

## 目次

1. [コンストラクタ](#コンストラクタ)
2. [ライフサイクル](#ライフサイクル)
3. [音源管理](#音源管理)
4. [リスナー管理](#リスナー管理)
5. [リバーブ](#リバーブ)
6. [ドップラー効果](#ドップラー効果)
7. [マスターボリューム](#マスターボリューム)
8. [パフォーマンス最適化](#パフォーマンス最適化)
9. [スケール調整](#スケール調整)
10. [デバッグ](#デバッグ)
11. [ログ](#ログ)
12. [イベント](#イベント)
13. [型定義](#型定義)

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

## ドップラー効果

### `setDopplerEffect(config: DopplerConfig): void`

ドップラーによるピッチシフトを設定します。視線方向の相対速度は、各再生中の音源とリスナーの**距離変化から自動的に算出**されるため、音源の移動（`updateSoundPosition`）とリスナー／地図の移動の両方に追従します。速度を自分で渡す必要はありません。`{ enabled: false }` を渡すと無効化され、ピッチが元に戻ります。

```ts
// デフォルト値で有効化
audio.setDopplerEffect({ enabled: true });

// 効果を強調し、音速を指定
audio.setDopplerEffect({ enabled: true, dopplerFactor: 1.5, speedOfSound: 340 });

// 無効化
audio.setDopplerEffect({ enabled: false });
```

#### DopplerConfig

```ts
interface DopplerConfig {
  enabled:         boolean;
  speedOfSound?:   number;  // m/s、デフォルト: 343.3
  dopplerFactor?:  number;  // 効果の強さ（0 で無効）、デフォルト: 1.0
  updateInterval?: number;  // 相対速度のサンプリング間隔(ms)、デフォルト: 100
  maxPitchRatio?:  number;  // クランプ。[1/ratio, ratio] として適用、デフォルト: 2.0
  smoothing?:      number;  // setTargetAtTime の時定数(秒)、デフォルト: 0.05
  listenerMotion?: boolean; // カメラ／地図の移動でピッチを変えるか、デフォルト: true
}
```

**`listenerMotion`** は、リスナー（カメラ／地図）の移動をピッチシフトに反映するかどうかを制御します。

| 値 | 挙動 |
|---|---|
| `true`（デフォルト） | 物理的に正確。音源**と**リスナーの両方の動きでピッチが変化します。 |
| `false` | 音源自身の動きのみでピッチが変化します。地図／カメラを操作してもピッチは一定で、ナビゲーション中の耳障りな揺れを防ぎます。 |

`false` のとき、ピッチ変化は「音源の速度ベクトルをリスナー→音源の視線方向に射影した成分」から求められ、リスナー自身の速度は無視されます。なお、左右の定位や距離減衰は従来どおりカメラに追従し、**ピッチのみ**が一定に保たれます。

**仕組み:** 各音源の `playbackRate` に適用されるピッチ比は次式で求めます。

```
ratio = speedOfSound / (speedOfSound + dopplerFactor × dr/dt)
```

`dr/dt` は距離の変化率です（正＝離れる→ピッチ低下、負＝近づく→ピッチ上昇）。

> **注意:** ピッチシフトに `AudioBufferSourceNode.playbackRate` を使うため、ピッチだけでなく再生速度も変化します。ループ音（サイレン・エンジン音）には自然ですが、ワンショット音では持続音で最も効果がわかります。Web Audio API のネイティブ・ドップラー（`PannerNode.setVelocity`）は仕様から削除済みのため、本ライブラリ内で計算しています。

---

## 音の伝搬遅延

### `setPropagationDelay(config: PropagationDelayConfig): void`

音の伝搬遅延（音速による到達遅延）を設定します。各音源は `distance / speedOfSound` 秒だけ遅延して聞こえるようになり、遠い音ほど実際の音の伝わり方に近い形で遅れて届きます。遅延時間は `setDopplerEffect` と同様に距離から**自動的に算出**され、音源の移動・リスナー／地図の移動の両方に追従します。`{ enabled: false }` を渡すと無効化され、遅延がゼロに戻ります。

```ts
// デフォルト値で有効化
audio.setPropagationDelay({ enabled: true });

// 音速を指定し、広いシーン向けに遅延上限を大きくする
audio.setPropagationDelay({ enabled: true, speedOfSound: 340, maxDelayTime: 10 });

// 無効化
audio.setPropagationDelay({ enabled: false });
```

#### PropagationDelayConfig

```ts
interface PropagationDelayConfig {
  enabled:         boolean;
  speedOfSound?:   number;  // m/s、デフォルト: 343.3
  updateInterval?: number;  // 距離のサンプリング間隔(ms)、デフォルト: 100
  maxDelayTime?:   number;  // 遅延の上限(秒) = DelayNode の容量、デフォルト: 5
  smoothing?:      number;  // setTargetAtTime の時定数(秒)、デフォルト: 0.1
  jumpThreshold?:  number;  // スナップ（瞬時反映）を発動する距離の変化量(m)、デフォルト: 500
}
```

**仕組み:** 各音源のオーディオは `DelayNode` を通過し、その遅延時間は `min(distance / speedOfSound, maxDelayTime)` に設定されます。更新のたびに直前のサンプルとの距離変化を比較します。

| 距離の変化量 | 挙動 |
|---|---|
| `jumpThreshold` 以下 | 連続的な移動（地図のパン、音源の移動）— `AudioParam.setTargetAtTime` により**なめらかにランプ**します。 |
| `jumpThreshold` を超える | 不連続な変化（`flyTo`／`setView`、`updateSoundPosition` による音源のテレポート）— 遅延を**瞬時にスナップ**し、ジャンプをまたいで不自然に音が伸び縮みするのを防ぎます。 |

> **注意:** `maxDelayTime` は `DelayNode` 生成時に固定される容量を決めるため、値を大きくしても効果があるのは**変更後に追加した音源のみ**です。既存の音源は生成時点の容量のまま残ります。`maxDelayTime * speedOfSound` より遠い音源は、遅延がそれ以上伸びずに上限でクランプされます。広いシーンでは `maxDelayTime` を大きくしてください（音源ごとの遅延バッファが大きくなる分、メモリ消費は増えます）。
>
> `setDopplerEffect` とは独立しており、両方同時に有効化できます。片方は到達時刻を遅らせ、もう片方はピッチを変化させるため、組み合わせることでどちらか単体よりも実際の音の伝搬に近い表現になります。

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
interface MapAdapter {
  getCenter(): Position;
  getZoom(): number;
  /** 方位角（度）: 0 = 北、時計回り */
  getBearing(): number;
  /**
   * リスナーのピッチ（仰角・度）: 0 = 水平、正 = 上向き、負 = 下向き。
   * 平面地図アダプター（MapLibre, Leaflet）はリスナーが地上に立つモデルの
   * ため常に 0 を返します。Cesium はカメラの仰角を返します。
   */
  getPitch(): number;
  getRoll?(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: { x: number; y: number }): [number, number];
  /**
   * カメラ（視点）が何らかの理由で変化したとき（パン・回転・ズーム・ピッチ）
   * に呼ばれるハンドラを登録します。地図ライブラリ固有のイベント群は
   * アダプターがこの単一の通知に束ねます。
   */
  onCameraChange(handler: () => void): void;
  /** 登録済みのカメラ変更ハンドラを解除します。 */
  offCameraChange(handler: () => void): void;
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
  DopplerConfig,
  PropagationDelayConfig,
  DebugConfig, DebugInfo, SoundDebugInfo,
  MapAdapter,
} from 'geospatial-audio-js';
```
