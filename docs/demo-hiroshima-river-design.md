# デモ設計: City of Water（水の都・太田川リバークルーズ）

> `demo-hiroshima-river/` として新規追加予定の Cesium デモの設計書

---

## コンセプト

6 本の川が流れる「水の都」広島を、観光船に乗った視点で下る体験デモ。
**リスナー（聴き手）自身が航路に沿って移動する** ことで、橋・河岸・かき船・カモメなどの音が左右を連続的に流れていく。

案1（路面電車）が「音源が動く」のに対し、本デモは **リスナーが動く** という対比的なアプローチ。
`setListenerPosition()` ／ `setListenerOrientation()` を航路に沿って更新し、`syncWithMap()` をオフにしてリスナーを能動的に制御する点が技術的な見どころ。

### 訴求ポイント

- **移動するリスナー** — `setListenerPosition()` を主役にした、聴き手が空間を移動する没入体験
- **ビジュアル** — 川面に 3D 建物が映り込むカメラワーク／船が川を下るシネマティックな映像
- **広島らしさ** — 「水の都」という都市の個性を音と映像で表現

---

## ディレクトリ構成

```
demo-hiroshima-river/
  index.html
  src/
    main.ts
    style.css
    cruise.ts         — 航路ジオメトリ（河川中心線 → 座標列）
  vite.config.ts
```

音声ファイルは `demo/public/audio/` に追加取得分を置き、`demo-hiroshima-river/` からも参照する。

### `package.json` への追加

```json
"dev:demo-hiroshima-river": "vite --config demo-hiroshima-river/vite.config.ts",
"build:demo-hiroshima-river": "vite build --config demo-hiroshima-river/vite.config.ts"
```

---

## 航路と河岸音源

元安川〜本川を下る航路を想定。リスナー（船）が航路を進み、両岸に固定された音源の脇を通過していく。

### 航路ジオメトリ（リスナーの移動経路）

既存 Cesium デモの `routePosition()` / `routeSegLen()` 補間ロジックを **リスナー側に転用** する。

```ts
// cruise.ts — 元安川を下る航路の waypoint（**要検証**）
export const CRUISE_ROUTE: [number, number, number][] = [
  [132.4545, 34.3960, 0],  // 原爆ドーム付近から出発
  [132.4540, 34.3948, 0],
  [132.4535, 34.3935, 0],
  [132.4528, 34.3915, 0],
  [132.4520, 34.3895, 0],  // 河口方向へ
];
```

進行方向（bearing）を waypoint 差分から算出し、`setListenerOrientation()` に渡す。

### 河岸の固定音源（5箇所）

| # | 音源 | 座標 `[lng, lat]`（**要検証**） | refDist | maxDist | rolloff |
|---|---|---|---|---|---|
| 1 | 原爆ドーム前の風 | [132.4538, 34.3955] | 20m | 200m | 1.0 |
| 2 | 橋の下の反響 | [132.4536, 34.3940] | 10m | 80m | 1.5 |
| 3 | かき船（焼き牡蠣・賑わい） | [132.4533, 34.3928] | 15m | 150m | 1.2 |
| 4 | 河岸のカモメ | [132.4525, 34.3908] | 10m | 200m | 1.0 |
| 5 | 河口の水門・水音 | [132.4520, 34.3895] | 15m | 150m | 1.3 |

> 座標はおおよその値。実装前に正確な位置の確認が必要。

---

## 必要な音声ファイル

### 流用（既存）

| ファイル | 使用 |
|---|---|
| `umineko.mp3` | 河岸のカモメ（ウミネコ） |
| `wave.mp3` | 河口の水音（流用可なら） |

### 新規取得（効果音ラボ等）

| ファイル名（仮） | 内容 | 使用 |
|---|---|---|
| `boat-engine.mp3` | 観光船のエンジン音（船上 BGM 的な近接音） | リスナー直下に追従配置 |
| `river-flow.mp3` | 川の流れ・水面 | 航路全体の環境音 |
| `bridge-echo.mp3` | 橋下の反響・水のはね | 橋の下 |
| `oyster-boat.mp3` | かき船の賑わい・焼き音 | かき船 |

> 船のエンジン音は「常に聞こえる近接音」なので、リスナー位置に追従させる固定音源（`updateSoundPosition` で同期）として扱う案もある。

---

## 新機能（既存デモとの差分）

### 1. リスナー駆動の航行（主役機能）

`syncWithMap(false)` でカメラ同期を切り、航路に沿ってリスナーを能動的に動かす。

```ts
audio.syncWithMap(false); // 自動同期オフ

viewer.scene.postRender.addEventListener(() => {
  if (startMs === null) return;
  const t   = (performance.now() - startMs) / 1000;
  const pos = routePosition(t);            // 既存ロジック流用
  const brg = routeBearing(t);             // 進行方向を算出（新規）
  audio.setListenerPosition(pos);
  audio.setListenerOrientation(brg, 0, 0);
});
```

進行方向の算出（`routeBearing`）は新規ヘルパー。現在 waypoint → 次 waypoint のベクトルから方位角を求める。

### 2. カメラ追従モード切替

- **船内視点**: カメラを船位置・進行方向に追従（一人称的）
- **俯瞰視点**: `viewer.trackedEntity = boatEntity` で船を斜め上から追尾（シネマティック）

### 3. 船マーカー + 航跡

既存デモの `CallbackPositionProperty` で船アイコンを描画。さらに航路 LineString を半透明ポリラインで表示し、進んだ部分の航跡を色変えする演出も検討。

### 4. 再生コントロール

「出航 / 一時停止 / 最初から」ボタンで航行をコントロール。`updateInterval` を短め（例 50ms）に設定し、移動の滑らかさを担保。

---

## 初期カメラ設定

```ts
// 出発地点（原爆ドーム付近）の川面を斜め上から
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(132.4548, 34.3965, 300),
  orientation: {
    heading: Cesium.Math.toRadians(200),  // 南向き（下流方向）
    pitch:   Cesium.Math.toRadians(-30),
    roll:    0,
  },
});
```

---

## 実装ステップ

1. `demo-cesium/` を `demo-hiroshima-river/` にコピー
2. `cruise.ts` に航路 waypoint を定義（OSM `waterway` 中心線 or 手動）
3. `routeBearing()` ヘルパーを追加
4. `syncWithMap(false)` に切り替え、`postRender` でリスナーを航路駆動
5. 河岸固定音源（5箇所）を `SOUND_DEFS` に定義
6. 船マーカー・航跡ポリライン・カメラ追従モードを実装
7. 音声ファイルを取得し `demo/public/audio/` に配置

---

## 技術的な注意点

- **リスナー制御 vs マップ同期**: 本デモは `syncWithMap(false)` が前提。カメラ操作とリスナー位置が分離するため、UI で「カメラは自由・リスナーは航路固定」であることを明示する
- **進行方向の符号**: `setListenerOrientation(bearing, pitch, roll)` の bearing の基準（北 0°・時計回り）を既存実装と突き合わせて確認する
- **船エンジン音の扱い**: 完全な無音源（リスナー直下）にすると HRTF の定位が不安定になりうるため、リスナー前方わずかにオフセットして配置するのが無難

---

## 未決事項

- **航路ジオメトリ**: 実在の観光船航路に合わせるか、河川中心線をなぞる簡易航路にするか
- **`routeBearing` の実装**: ライブラリの bearing 基準の確認（`docs/api.md` 参照）
- **音声ファイル**: `boat-engine.mp3` / `oyster-boat.mp3` の入手可否
- **船エンジン音の配置方式**: リスナー追従固定音源とするか、環境音として全体に薄く敷くか
