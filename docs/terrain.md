# 地形生成

全体索引は [design.md](design.md)。チャンクのデータ表現は [world.md](world.md) を参照。
このドキュメントは「高さがどう決まるか」のアルゴリズムと、なぜそのパラメータかの記録。

## ゴール

- 海と陸が混在し、なだらかな丘が点在する
- 同じシード + 座標で**必ず同じ**地形（決定論）
- チャンク境界でズレない（ノイズ関数が world 座標で連続）
- 2D ヘイトマップのみ（洞窟は持たない、`docs/world.md` の方針通り）

## チャネル構成

2 つの独立な Simplex ノイズを合成する:

| チャネル        | 役割                       | 周波数 | 振幅 | オクターブ |
| --------------- | -------------------------- | ------ | ---- | ---------- |
| **continental** | 海/陸の大スケール高度差    | 0.003  | 25   | 1          |
| **base**        | 局所的な丘・凹凸（FBM）    | 0.015  | 8    | 4          |

最終高さ:

```
h = SEA_LEVEL + continental(wx, wz) * 25 + fbm(base, wx, wz) * 8
```

- `continental ≈ -1`: 深い海（高さ ~29）
- `continental ≈  0`: 海岸付近（高さ ~62）
- `continental ≈ +1`: 内陸の丘（高さ ~95）

### なぜこの構成か

- **2D ヘイトマップで完結**: 3D ノイズや「地下を抜く」処理がいらず、Worker 側のループが O(16×16) で軽い
- **大陸度を低周波で**: 周波数 0.003 → 約 333 ブロック / 周期。1 チャンク (16) 内ではほぼ一定の値で、広い「海エリア / 陸エリア」が自然に出る
- **小起伏は FBM で**: 単一周波数だと「波打ち際の規則的な縞」が見えやすいので、4 オクターブで揺らす

### 検討して採用しなかった案

- **Ridged ノイズで尾根を足す**: 山岳感は出るが、(a) 全体の平均高度が押し上げられて海が消える、(b) 尾根線で勾配が急になり境界差が増える。当面のスコープでは外す
- **温度・湿度・バイオーム分類**: スコープ外（[CLAUDE.md](../CLAUDE.md) の「やらないこと」）
- **3D ノイズで洞窟**: 同上、スコープ外
- **Domain warping**: 良い質感が出るがコストが倍。必要になってから

## 多オクターブ FBM

```ts
function fbm(noise, x, y, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;   // 振幅は半減
    freq *= 2;    // 周波数は倍
  }
  return sum / norm;  // [-1, 1] に正規化
}
```

- 各オクターブで amplitude × 0.5, frequency × 2（古典的な FBM）
- `sum / norm` で出力を概ね [-1, 1] に揃え、振幅定数（`*8`）の意味を一定に保つ
- オクターブ数 4: 5 以上は計算コストが増える割に視覚的差分が少ない

## 決定論とシード派生

ノイズチャネルごとに独立な PRNG を作る:

```ts
const prng = createPrng;
const set = {
  continental: createNoise2D(prng(seed)),
  base:        createNoise2D(prng((seed ^ 0x9e3779b1) >>> 0)),
};
```

- 各チャネルが同じ順列表を共有しないように **XOR で派生**。`0x9e3779b1` は φ から来る Knuth の混ぜ定数で、ビットパターンが偏らない
- `createPrng` は [`src/world/prng.ts`](../src/world/prng.ts) の mulberry32 系。`Math.random()` は決定論にできないので使わない（[CLAUDE.md](../CLAUDE.md) 制約）

### なぜ chunkX, chunkZ をシードに混ぜないか

- ノイズ関数は world 座標 (wx, wz) を直接受ける。隣のチャンクとの境界で値が連続するのは、入力座標が連続だから
- チャンクごとに別 PRNG にしてしまうと境界で値が断絶する

## パフォーマンス上の工夫

### ノイズ関数のキャッシュ

`createNoise2D()` は内部で 256 エントリの順列表を構築する（数百 µs）。
毎チャンク再構築するのは無駄なので、seed 毎にキャッシュ:

```ts
const noiseCache = new Map<number, NoiseSet>();
```

- Worker と main thread はメモリ空間が別なので、それぞれが自前のキャッシュを持つ（OK）
- セッションをまたいでクリアしない（次のワールドで再構築されるだけ）

### Worker への配置

- `generateHeightmap` も `generateBlocks` も純粋関数。`chunk.worker.ts` から呼ばれる
- main thread からも直接呼べる（起動時のスポーン周辺の同期ロード用）。両側で同じキャッシュ戦略

## ブロック配置

`generateBlocks(heightmap)` は heightmap から `Uint8Array(16×128×16)` を組む:

| 条件                            | ブロック  |
| ------------------------------- | --------- |
| `y < h`                         | STONE     |
| `y == h` かつ `h > SEA_LEVEL`   | GRASS     |
| `y == h` かつ `h <= SEA_LEVEL`  | SAND      |
| `h < y <= SEA_LEVEL`            | WATER     |
| `y > SEA_LEVEL` かつ `y > h`    | AIR (= 0) |

SEA_LEVEL = 62。土層（DIRT）は未導入。導入する場合は `add-block` skill 経由で。

## パラメータ調整の指針

すべて [`src/world/generator.ts`](../src/world/generator.ts) 冒頭の定数。

| 症状                       | いじる定数                         |
| -------------------------- | ---------------------------------- |
| 海が多すぎ / 少なすぎ      | `BASE_HEIGHT`（中心高さ）          |
| 大陸/海の規模を変えたい    | `CONTINENT_FREQ`（小さいほど広大） |
| 海・陸の高度差を強調したい | `CONTINENT_AMPLITUDE`              |
| 丘の凹凸を派手にしたい     | `BASE_AMPLITUDE`                   |
| 丘のサイズを変えたい       | `BASE_FREQ`（小さいほど大きい丘）  |
| 細かい起伏を増やしたい     | `BASE_OCTAVES`（4 → 5）            |

### 振幅を大きくする時の注意

`CONTINENT_AMPLITUDE + BASE_AMPLITUDE` の合計を上げすぎると、チャンク境界での隣接セル差 (`docs/world.md` の連続性条件) を破る。
[`src/world/generator.test.ts`](../src/world/generator.test.ts) の「チャンク境界で高さが連続している（≤4）」テストで上限を担保している。

## 将来の拡張パス

- **Ridged ノイズで山岳**: continental 上位閾値だけ blend で乗せる形にすれば、海を保ったまま山地が出る
- **河川**: heightmap に対して `|river_noise| < ε` で谷を彫る（決定論的に薄い窪み）
- **温度・湿度 → バイオーム**: スコープを広げる時に追加チャネルとして拡張可能。既存の `NoiseSet` に足すだけ
- **土層（DIRT）**: 表面の下 3 ブロックを DIRT に置き換え。`add-block` skill 参照
- **3D ノイズで洞窟**: 別ステップ（heightmap 後）で `cave_noise(x, y, z) > threshold` を AIR に
- **wasm 化**: `fbm` と座標ループは数値演算が支配的。ボトルネックになれば wasm 移行候補
