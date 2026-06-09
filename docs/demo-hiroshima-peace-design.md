# デモ設計: Peace Memorial Soundscape（平和記念公園 サウンドウォーク）

> `demo-hiroshima-peace/` として新規追加予定の Cesium デモの設計書

---

## コンセプト

広島平和記念公園を舞台に、原爆ドーム・平和の鐘・元安川・慰霊碑などを巡る、**静謐で内省的な音の散歩**。
来訪者が突く「平和の鐘」の余韻、川のせせらぎ、蝉、折り鶴に当たる風など、場所固有の環境音を HRTF 空間音響で体験する。

既存デモが「音源の数・賑やかさ」を見せるのに対し、本デモは **リバーブ（環境音響）による空間表現** を主役に据える。
鐘の残響、川辺の広がり、開けた公園の反響感を `setReverb()` のプリセット切替で体感させる。

### 訴求ポイント

- **リバーブ（環境音響）** — `room` / `hall` / `outdoor` プリセットと wet/dry の効果を最も体感できる題材
- **ビジュアル** — 原爆ドームを 3D 表示し、夕景ライティングで情緒的な画作り
- **広島らしさ** — 国際平和文化都市・広島を代表する場所

> ⚠️ **トーンの配慮**：題材の性質上、観光的に騒がしくせず「祈り・静けさ・追悼」を基調とする。
> 音量・選曲・UI 文言は慎重に設計する。歓声・娯楽音は使わない。

---

## ディレクトリ構成

```
demo-hiroshima-peace/
  index.html
  src/
    main.ts
    style.css
  vite.config.ts
```

音声ファイルは `demo/public/audio/` に追加取得分を置き、`demo-hiroshima-peace/` からも参照する。

### `package.json` への追加

```json
"dev:demo-hiroshima-peace": "vite --config demo-hiroshima-peace/vite.config.ts",
"build:demo-hiroshima-peace": "vite build --config demo-hiroshima-peace/vite.config.ts"
```

---

## 音源スポット（5箇所）

| # | スポット | 座標 `[lng, lat]`（**要検証**） | 音のキャラクター | refDist | maxDist | リバーブ |
|---|---|---|---|---|---|---|
| 1 | 原爆ドーム | [132.4536, 34.3955] | 川風・遠景の街のざわめき | 20m | 200m | `outdoor` |
| 2 | 平和の鐘 | [132.4525, 34.3945] | 梵鐘の打鐘と長い余韻 | 15m | 250m | `hall`（長残響） |
| 3 | 元安川 河岸 | [132.4530, 34.3948] | 水のせせらぎ・船 | 10m | 120m | `outdoor` |
| 4 | 原爆死没者慰霊碑 | [132.4523, 34.3920] | 静寂・鳩・微かな足音 | 15m | 150m | `outdoor` |
| 5 | 平和の灯／折り鶴 | [132.4528, 34.3930] | 風・折り鶴の触れ合う音 | 10m | 100m | `outdoor` |

> 座標はおおよその値。実装前に正確な位置の確認が必要。

---

## 必要な音声ファイル

### 流用（既存）

| ファイル | 使用 |
|---|---|
| `wave.mp3` → 不可。本デモは川なので新規取得が望ましい | — |

> 既存の海・蝉素材は雰囲気が合えば一部流用可（要試聴）。`minminzemi.mp3` / `aburazemi.mp3` は夏の公園演出に流用候補。

### 新規取得（効果音ラボ等）

| ファイル名（仮） | 内容 | 使用スポット |
|---|---|---|
| `peace-bell.mp3` | 梵鐘・鐘の打鐘＋余韻 | 平和の鐘 |
| `river-stream.mp3` | 川のせせらぎ | 元安川 河岸 |
| `wind-soft.mp3` | 穏やかな風 | 原爆ドーム・折り鶴 |
| `pigeon.mp3` | 鳩の羽音・鳴き声 | 慰霊碑 |
| `city-ambience-distant.mp3` | 遠景の街の低いざわめき | 原爆ドーム |

> ⚠️ 鐘素材はリバーブを「乗せる」前提で、残響少なめのドライな打鐘音を選ぶと `setReverb()` の効果が分かりやすい。

---

## 新機能（既存デモとの差分）

### 1. リバーブ・コントロールパネル（主役機能）

画面にリバーブの種類と wet/dry を操作する UI を置き、空間の響きの変化を体感させる。

```ts
audio.setReverb({ enabled: true, type: 'hall', wet: 0.5, dry: 0.5 });
```

```
Reverb:  [ Off ] [ Room ] [ Hall ] [ Outdoor ]
Wet ──────●──────  Dry ────●────────
```

- 鐘の前では `hall`（長残響）、開けた園内では `outdoor` を推奨値としてプリセット
- スポットへ近づくと自動でリバーブが切り替わる「オートモード」も検討

### 2. 平和の鐘を「突く」インタラクション

鐘マーカーをクリックすると `playSound('peace-bell')`（ワンショット）で打鐘音を鳴らす。
ループ環境音とは別に、ユーザー操作で鳴る点が体験のフックになる。

```ts
// クリックで一回だけ鳴らす（loop: false）
bellEntity.onClick = () => audio.playSound('peace-bell');
```

### 3. スポット情報カード

カメラがスポット半径 200m 以内に入ったとき、画面下にカードを表示（Tokyo 設計書と同方式）。
文言は **追悼の場にふさわしい簡潔・中立な英語／日本語** とする。

```
📍 Atomic Bomb Dome (Genbaku Dome)
  A UNESCO World Heritage Site preserved
  as a symbol of peace.
  🔊 River breeze, distant city
```

### 4. 夕景ライティング（ビジュアル強化）

Cesium のシーン照明で夕方の太陽角度を設定し、情緒的な画作りにする。

```ts
viewer.scene.globe.enableLighting = true;
viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2026-08-06T09:00:00Z'); // 夕刻
```

---

## 初期カメラ設定

```ts
// 元安川越しに原爆ドームを正面に捉える
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(132.4540, 34.3935, 400),
  orientation: {
    heading: Cesium.Math.toRadians(340),
    pitch:   Cesium.Math.toRadians(-25),
    roll:    0,
  },
});
```

---

## 実装ステップ

1. `demo-cesium/` を `demo-hiroshima-peace/` にコピー
2. `SOUND_DEFS` を平和記念公園の 5 スポットに差し替え（全て静的音源）
3. リバーブ・コントロールパネル UI を実装（`setReverb()` / `disableReverb()`）
4. 鐘のクリックワンショット再生を実装
5. スポット情報カード・夕景ライティングを追加
6. 音声ファイルを取得し `demo/public/audio/` に配置

---

## 未決事項

- **トーン設計**: UI 文言・音量・選曲のレビュー（追悼の場としての配慮）
- **音声ファイル**: `peace-bell.mp3` の良質な素材の入手可否（リバーブ前提のドライ素材）
- **オートリバーブ**: スポット接近で自動切替する機能の要否（実装コスト増）
- **ライティング**: GSI タイル + `enableLighting` で夕景が十分映えるかの検証