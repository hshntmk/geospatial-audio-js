# geospatial-audio-js

Web 地図上の経緯度に音源を置き、地図のカメラ位置と向きに合わせて立体音響で鳴らす TypeScript ライブラリです。MapLibre GL JS、Leaflet、CesiumJS で使えます。音の定位には Web Audio API の `PannerNode`（HRTF）を使っています。

[English](README.md)

## インストール

```bash
npm install geospatial-audio-js
```

地図ライブラリは同梱していません。使うもの（maplibre-gl、leaflet、cesium のいずれか）は別にインストールしてください。

## 使い方

MapLibre GL JS の地図に音源を 1 つ置く例です。

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

document.getElementById('start').addEventListener('click', async () => {
  await audio.initialize();

  await audio.addSound({
    id: 'birds',
    position: [139.691, 35.691], // [経度, 緯度, 高度(m, 省略可)]
    url: 'audio/birds.mp3',
    loop: true,
    autoplay: true,
    pannerOptions: {
      refDistance: 10,   // この距離(m)までは減衰しない
      maxDistance: 200,
      rolloffFactor: 1.5,
    },
  });
});
```

ブラウザはユーザー操作の前に音を鳴らせないため、`initialize()` はクリックなどのイベントハンドラの中で呼びます。`addSound()` は音声ファイルを取得してデコードし終わるまで待ちます。

あとは地図を動かすと、音源の聞こえる方向と距離が変わります。移動する音源は `updateSoundPosition('birds', [lng, lat, alt])` で位置を更新します。

### Leaflet と CesiumJS

アダプターを差し替えれば、ほかの API は同じです。

```ts
new GeospatialAudio(new LeafletAdapter(map));
new GeospatialAudio(new CesiumAdapter(viewer, Cesium)); // Cesium 名前空間も渡す
```

リスナー（聞き手）の位置は、アダプターによって次のように決まります。

- MapLibre と Leaflet では、リスナーは地図の中心に高度 0 で立っています。向きは地図の bearing に合わせますが、地図を傾けても（pitch）リスナーは水平を向いたままです。Leaflet は回転できないので常に北を向いています。
- Cesium では、カメラの位置（高度を含む）にリスナーを置き、カメラの heading、pitch、roll をそのまま使います。音源に高度を指定すると上下の定位にも効きます。

`setListenerPosition()` か `setListenerOrientation()` を呼ぶと地図への追従が止まり、リスナーを地図とは別に動かせます。追従に戻すには `syncWithMap(true)` を呼びます。

## 音響効果と距離カリング

次の 4 つの効果は既定で無効です。個別に有効にでき、同時に使うこともできます。

```ts
audio.setReverb({ enabled: true, type: 'hall', wet: 0.3 });  // 'room' | 'hall' | 'outdoor'、または customIR に AudioBuffer
audio.setDopplerEffect({ enabled: true });     // 音源とリスナーの距離の変化からピッチを変える
audio.setPropagationDelay({ enabled: true });  // 距離 ÷ 音速(既定 343.3 m/s)だけ遅れて届く
audio.setAirAbsorption({ enabled: true });     // 遠い音ほど高音域を削る(ローパスフィルタ)
```

距離カリングは `initialize()` の時点で有効になります。既定では 5000 m より遠い音源を一時停止し、範囲内に戻ると再開します。同時に再生するのはリスナーに近い順に 10 個までです。

```ts
audio.setOptimization({ cullingDistance: 2000, maxActiveSounds: 20 });
```

再生制御、イベント、デバッグ情報の取得を含む全メソッドと設定項目は [docs/api.ja.md](docs/api.ja.md) にあります。

## 制限事項

- 経緯度から音響空間の座標（メートル）への変換には正距円筒近似を使っています。リスナーから遠い音源ほど方向と距離の誤差が大きくなります。
- リバーブは全音源の出力にまとめてかかります。音源ごとに違うリバーブはかけられません。
- ドップラー効果、伝搬遅延、空気吸収は、音源までの距離を 100 ms ごと（`updateInterval` で変更可）に測って計算します。
- 伝搬遅延の上限は 5 秒（音速 343.3 m/s で約 1.7 km）です。`maxDelayTime` で変えられますが、変更後に追加した音源にしか効きません。
- Google Maps と OpenLayers のアダプターはありません。`MapAdapter` インターフェースを実装すれば、ほかの地図ライブラリでも使えます。
- 対応ブラウザは Chrome、Edge、Firefox、Safari（iOS 14 以降）の最新版です。

## デモ

リポジトリを clone して `npm install` したあと、次のどちらかを実行して http://localhost:5173/ を開きます。

| コマンド | 内容 |
|---|---|
| `npm run dev:demo-maplibre` | MapLibre GL JS（2D/3D） |
| `npm run dev:demo-cesium` | CesiumJS |

デモの画面は日本語です。説明は [docs/demo.ja.md](docs/demo.ja.md) にあります。変更履歴は [CHANGELOG.md](CHANGELOG.md) を見てください。

## ライセンス

[MIT](LICENSE)
