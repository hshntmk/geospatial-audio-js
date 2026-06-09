# デモ設計: Hiroden Sound Ride（広島 路面電車サウンドライド）

> `demo-hiroshima-hiroden/` として新規追加予定の Cesium デモの設計書

---

## コンセプト

「路面電車の街」広島の象徴である広島電鉄（広電）を題材に、**音源そのものが地図上を移動する** デモ。
路線ジオメトリに沿って電車を走らせ、`updateSoundPosition()` で走行音を線路に沿って動かす。
電停（プラットフォーム）に立つリスナー視点で、電車が **近づき・通り過ぎ・遠ざかる** 様子を HRTF 空間音響で体験できる。

既存の Cesium 海岸デモがウミネコ1体だけを移動させていたのに対し、本デモは **複数編成の電車を路線網に沿って連続走行** させ、ライブラリの移動音源機能（`updateSoundPosition()`）を主役に据える。

### 訴求ポイント

- **動く音源** — 静的 POI デモにはない「音が空間を移動する」体験。本ライブラリの核を最も直感的に示す
- **ビジュアル** — Cesium 3D 建物の谷間を電車マーカーが走るカットが映える
- **広島らしさ** — 全国有数の路面電車ネットワークという都市アイデンティティ

---

## ディレクトリ構成

```
demo-hiroshima-hiroden/
  index.html
  src/
    main.ts
    style.css
    route.ts          — 路線ジオメトリ（GeoJSON LineString → 座標列）
  vite.config.ts
```

音声ファイルは `demo/public/audio/` に追加取得分を置き、`demo-hiroshima-hiroden/` からも参照する（既存 Cesium デモと同方針）。

### `package.json` への追加

```json
"dev:demo-hiroshima-hiroden": "vite --config demo-hiroshima-hiroden/vite.config.ts",
"build:demo-hiroshima-hiroden": "vite build --config demo-hiroshima-hiroden/vite.config.ts"
```

---

## 舞台と路線

広電の都心区間（広島駅前〜紙屋町〜原爆ドーム前〜西広島方面）を対象とする。
1〜2 編成の電車を路線ポリラインに沿って巡回走行させる。

### 主要電停（POI・静的音源／カメラ候補地点）

| # | 電停 | 座標 `[lng, lat]`（**要検証**） | 役割 |
|---|---|---|---|
| 1 | 広島駅前 | [132.4757, 34.3978] | カメラ初期位置・駅雑踏音 |
| 2 | 八丁堀 | [132.4628, 34.3955] | 交差点音 |
| 3 | 紙屋町東 | [132.4585, 34.3938] | 繁華街雑踏 |
| 4 | 原爆ドーム前 | [132.4540, 34.3950] | ランドマーク・カメラ注目点 |
| 5 | 本通 | [132.4575, 34.3920] | 商店街音 |

> 座標はおおよその値。実装前に正確な電停位置の確認が必要。

### 路線ジオメトリ

電車の走行経路は **LineString（座標列）** として `route.ts` に保持する。
既存 Cesium デモの `UMINEKO_ROUTE` と同じ「waypoint 配列 + 区間補間」方式を流用する。

```ts
// route.ts
// 広島駅前 → 八丁堀 → 紙屋町 → 原爆ドーム前 → 西広島方面（往復 or ループ）
export const HIRODEN_ROUTE: [number, number, number][] = [
  [132.4757, 34.3978, 0],
  [132.4690, 34.3965, 0],
  [132.4628, 34.3955, 0],
  [132.4585, 34.3938, 0],
  [132.4540, 34.3950, 0],
  // …西広島方面へ続く
];
```

---

## 音源定義

### 移動音源（主役）

| ID | 内容 | 移動 | refDist | maxDist | rolloff |
|---|---|---|---|---|---|
| `tram-1` | 電車走行音（モーター・レール音） | ✅ ルート巡回 | 15m | 250m | 1.2 |
| `tram-2` | 2 編成目（任意・逆走 or 時間差） | ✅ | 15m | 250m | 1.2 |

### 静的音源（環境音・場の演出）

| ID | 内容 | 座標 | refDist | maxDist | rolloff |
|---|---|---|---|---|---|
| `bell` | 発車ベル「チンチン」 | 各電停 | 10m | 120m | 1.5 |
| `crossing` | 踏切・交差点音 | 八丁堀 | 10m | 150m | 1.5 |
| `crowd` | 商店街・駅前の雑踏 | 本通 | 20m | 200m | 1.0 |

---

## 必要な音声ファイル

### 流用（既存）

| ファイル | 使用 |
|---|---|
| `intersection.mp3` | `crossing`（交差点音） |

### 新規取得（効果音ラボ等）

| ファイル名（仮） | 内容 | 使用 |
|---|---|---|
| `tram-running.mp3` | 路面電車の走行音・モーター音 | `tram-1` / `tram-2` |
| `tram-bell.mp3` | 発車ベル「チンチン」 | `bell` |
| `crowd-shopping.mp3` | 商店街・駅前の雑踏 | `crowd` |

> ⚠️ 走行音はループ前提のため、無音間のないシームレスにループできる素材を選ぶこと。

---

## 新機能（既存デモとの差分）

### 1. ルート補間による複数編成の連続走行

既存 Cesium デモの `routePosition(elapsedSec)` ／ `routeSegLen()` ／ `postRender` 更新ループを **そのまま流用**。
編成ごとに「開始時刻オフセット」を変えることで複数編成を時間差で走らせる。

```ts
// 既存デモと同じパターン
viewer.scene.postRender.addEventListener(() => {
  if (startMs === null) return;
  const t = (performance.now() - startMs) / 1000;
  tram1Pos = routePosition(t);
  tram2Pos = routePosition(t + TRAM2_OFFSET_SEC); // 時間差
  audio.updateSoundPosition('tram-1', tram1Pos);
  audio.updateSoundPosition('tram-2', tram2Pos);
});
```

電車マーカーは既存デモと同様 `Cesium.CallbackPositionProperty` で追従させる。

### 2. 「電車視点」⇄「電停視点」カメラ切替

- **電停視点（デフォルト）**: リスナーを電停に固定し、`syncWithMap(true)` でカメラに同期。電車が目の前を通過する体験
- **電車追従視点**: `viewer.trackedEntity = tram1Entity` で電車を追尾。街並みが流れる映像 + 自分が音源とともに移動する体験

UI にトグルボタンを置き、切り替えられるようにする。

### 3. 3D 建物表示（ビジュアル強化）

既存デモは GSI シームレス写真タイル + `EllipsoidTerrainProvider`（平面）。
本デモでは映えを優先し、以下のいずれかを追加する。

- **Cesium OSM Buildings**（`Cesium.createOsmBuildingsAsync()`）— Ion トークンが必要
- トークン不要で進める場合は GSI タイルのまま、初期カメラ高度を低めにして街路スケールを強調

> 未決事項：Ion トークン運用の可否（既存デモはトークン不要を売りにしている）。

### 4. 速度スライダー（`setScale()` の可視化／任意）

電車の走行速度を変えるスライダーを置き、音の移動の速さ＝パンの変化速度を体感させる。
時間圧縮の演出として `setScale()` を併用してもよい。

---

## 初期カメラ設定

```ts
// 原爆ドーム前付近を見下ろし、路線を斜めから捉える
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(132.4585, 34.3938, 800),
  orientation: {
    heading: Cesium.Math.toRadians(30),
    pitch:   Cesium.Math.toRadians(-40),
    roll:    0,
  },
});
```

---

## 実装ステップ

1. `demo-cesium/` を `demo-hiroshima-hiroden/` にコピーし、`vite.config.ts` / `index.html` を複製
2. `route.ts` に路線座標列を定義（OSM `railway=tram` から抽出 or 手動 waypoint）
3. `SOUND_DEFS` を広島の音源に差し替え
4. 移動音源を `umineko` 1 体 → `tram-1`/`tram-2` の複数編成に拡張
5. カメラ切替・速度スライダー UI を追加
6. 音声ファイルを取得し `demo/public/audio/` に配置

---

## 未決事項

- **路線ジオメトリの調達**: OSM から正確な軌道線形を取得するか、主要電停を結ぶ簡易ポリラインで妥協するか
- **音声ファイル**: `tram-running.mp3` / `tram-bell.mp3` の入手可否
- **3D 建物**: Cesium Ion トークン運用の可否（既存デモのトークン不要方針との整合）
- **編成数**: パフォーマンス（同時再生数）と `maxActiveSounds` の兼ね合い
