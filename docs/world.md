# ワールド構造

全体索引は [design.md](design.md)。

## チャンク分割

- サイズ: **16 × 16 × 128**（X × Z × Y）
- データ表現: `Uint8Array(16*16*128)` のフラット配列
- インデックス: `x + z*16 + y*256`

**理由**

- 16×16 は Minecraft 準拠で資料が当てはめやすい
- 高さ128は洞窟なし・simple-craft には十分（256だとメモリと生成時間が倍になる）
- フラット配列は Transferable・キャッシュ効率・wasm 移行のしやすさで優位

## 生成パイプライン

```
シード+座標
   ↓
heightmap (Float32Array, 16×16)
   ↓
ブロック配置 (Uint8Array, 16×16×128)
   ├ y < height-3: 石
   ├ y < height:   砂 or 草の下層
   ├ y == height:  草 or 砂
   └ y < seaLevel & 空気: 水
   ↓
メッシュ生成 (positions/normals/uvs/indices/colors)
```

heightmap 生成、ブロック配置、メッシュ生成は全部 Worker 側に閉じる。Worker 設計は [concurrency.md](concurrency.md)、メッシュ生成アルゴリズムは [rendering.md](rendering.md) を参照。

## 隣接チャンクの境界処理

メッシュ生成時に「隣のブロックが空気か」を見る必要がある。方式の選択肢:

| 方式                                       | メリット               | デメリット                |
| ------------------------------------------ | ---------------------- | ------------------------- |
| **パディング**（自チャンク+隣接1ブロック） | 実装が単純、Worker 完結 | 隣接チャンクの計算が重複  |
| SharedArrayBuffer                          | 計算重複なし           | COOP/COEP ヘッダ必要、複雑 |

**採用: パディング方式**。simple-craft の規模では重複コストは無視できる。SharedArrayBuffer は将来検討。
