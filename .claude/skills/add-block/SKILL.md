---
name: add-block
description: simple-craft に新しいブロックを追加する時に使う。テクスチャ仕様（16×16・シームレスタイル・アルファ付き）、アトラス境界のブリード防止、ファイル配置、コード側の更新箇所を網羅。テクスチャ画像の追加・差し替えを伴う作業すべてで参照する。
---

# 新しいブロックを追加する

## テクスチャ画像の仕様

すべて以下を満たすこと:

- **解像度**: 16×16 px（高解像度版を将来出すならその整数倍）
- **形式**: PNG、アルファチャンネル付き
- **タイリング**: 横・縦をループで並べた時に**継ぎ目が出ない**こと
  - 左端と右端のピクセルの色・パターンが連続している
  - 上端と下端も同様
  - 確認は「同じ画像を 4×4 に並べてみて、タイルの境界線が見えないか」
- **エッジの安全マージン**: アトラスに焼く時にブリードを起こさないよう、最外周1px は中央領域と色が滑らかに繋がる状態を保つ（極端な色をエッジに置かない）

## ファイル配置と命名

`public/textures/blocks/` に以下の命名で置く:

- 全面共通のブロック: `{block}.png`（例: `stone.png`, `sand.png`）
- 面別のブロック: `{block}_top.png` / `{block}_bottom.png` / `{block}_side.png`（例: 草ブロック）

## アトラス上のパッキング

`src/render/atlas.ts` でテクスチャ間に**1px のパディング**（隣接ピクセルからの色滲み防止）を入れる:

- 各テクスチャの周囲 1px は「自分自身のエッジを複製した枠」で埋める
- これによりリニア補間時の隣接テクスチャからの侵食を防げる
- mipmap は無効化前提。NearestFilter で描画

## コード側で必要な更新

1. **`src/world/block.ts`**
   - ブロックID 定数を追加（例: `BLOCK.SAND = 3`）
   - 性質テーブルに追加: `{ opaque: boolean, faces: 'uniform' | 'top-bottom-side' }`
2. **`src/render/atlas.ts`**
   - 新ブロックの UV エントリを追加
3. **アトラス画像の再生成**
   - ビルドスクリプト経由 or 手動で `public/textures/atlas.png` を更新
4. **必要に応じて `src/world/generator.ts`**
   - 配置ロジックに新ブロックを組み込む（例: 砂を水際に置く）

## AI 生成プロンプトの定型

```
16×16 pixel art texture of [object], top-down view,
seamlessly tileable both horizontally and vertically,
flat pixel art style, no shadows extending beyond the tile,
transparent background where applicable, PNG.
```

タイル境界の継ぎ目が出る場合は「seamlessly tileable」を強調する or 出力後にエッジを手動で繋ぐ。

## 動作確認

- ブラウザで対象ブロックを置いてみて、面の継ぎ目（同ブロック同士の境界）に線が出ていないか
- 平地に同じブロックを敷き詰めた時にタイリングの境目が見えないか
- 半透明ブロックなら不透明ブロックと別パスで描画されているか（[rendering.md](../../../docs/rendering.md)）

## 関連ドキュメント

- [docs/textures.md](../../../docs/textures.md) — テクスチャの設計判断
- [docs/rendering.md](../../../docs/rendering.md) — アトラス・マテリアル
- [docs/world.md](../../../docs/world.md) — ブロックID とチャンクデータ
