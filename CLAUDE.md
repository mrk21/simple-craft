# Simple Craft

Minecraftライクなボクセルゲーム。ブラウザ上でWebGLで動作。

詳細な設計判断は [docs/design.md](docs/design.md)（トピック別に [docs/](docs/) 内に分割）を参照。
実装手順系は [.claude/skills/](.claude/skills/) の skill（`add-block`、`tdd`）が用意されているので、該当タスクの時はそちらを使う。

## スタック

- Vite + TypeScript
- Three.js（レンダリング）
- simplex-noise（地形生成、シード対応）
- idb（IndexedDBラッパー）

## 絶対に守る制約

### ワールド生成は決定論的

- 同じシード+同じ座標 → 必ず同じチャンクが生成される
- ノイズ関数やブロック配置に `Math.random()` を使わない（シードから派生したPRNGを使う）

### Workerは純粋関数

- 入力: `{ chunkX, chunkZ, seed }` などの値のみ
- 出力: ArrayBuffer群
- 副作用なし・グローバル状態なし。テストもwasm化もこの前提で楽になる

### チャンク/メッシュデータはTypedArrayで持つ

- `number[]` は使わない（GC負荷・メモリ非連続）
- ブロックID: `Uint8Array`、座標/UV: `Float32Array`、index: `Uint32Array`
- `postMessage` 時は必ず Transferable で渡す（`postMessage(data, [buffer])`）

### 保存はシード+差分のみ

- チャンクの地形そのものをDBに保存しない（シードから再生成）
- 保存対象は「プレイヤーの編集差分」「シード」「プレイヤー状態」だけ
- チャンク丸ごと書き戻すロジックを足さない

### ゲームループは固定タイムステップ

- 物理（プレイヤー移動・衝突）は `FIXED_DT = 1/60` で固定ステップ
- 描画は `requestAnimationFrame` で可変（モニタ依存）
- フレーム間 `dt` は `MAX_FRAME_DT = 0.25` でクランプ（タブ復帰時の暴走防止）
- 移動量は必ず `velocity * FIXED_DT` で計算する（`velocity * dt_real` のフレームレート依存は禁止）
- チャンクロード判定・メッシュのシーン追加など重い処理は毎フレームではなくイベントベース・上限付きで実行

### 純粋ロジックは TDD で実装（t-wada 流）

- 地形生成、meshing、AABB物理、PRNG、保存層の差分マージ、座標変換などの「入力→出力」関数は **Red→Green→Refactor** で書く
- **t-wada 流**: テストリストを書く、一度に1つだけ書く、Red を確認してから実装、仮実装/三角測量/明白な実装を使い分ける
- Three.js のシーン構築・DOM ハンドラなど副作用主体のコードは対象外
- テストランナーは Vitest。`*.test.ts` をソースの隣に置く
- 詳細は skill [tdd](.claude/skills/tdd/SKILL.md) 参照

### テクスチャ

- アトラス1枚にまとめる（draw call削減）
- `THREE.NearestFilter` 必須（ピクセルアートのぼかし防止）
- mipmapは無効化 or 慎重に（アトラス境界で滲む）
- 新ブロックの追加・テクスチャ差し替え時は skill [add-block](.claude/skills/add-block/SKILL.md) を必ず参照

### 水ブロック

- 半透明: 別パスで描画（不透明ブロックの後）
- 不透明ブロックと同じメッシュに混ぜない

## 推奨されるディレクトリ構成

```
src/
  core/      ゲームループ・入力・カメラ
  world/     chunk, block定義, generator
  render/    mesher, atlas, materials
  workers/   chunk生成・meshing worker
  game/      player, AABB物理
  storage/   IndexedDBアクセス
```

## やらないこと（スコープ外）

- 洞窟生成
- バイオーム（草の色は最初から緑固定）
- エンティティ（モブ）
- マルチプレイ
- サーバサイド（将来検討、当面クライアント完結）

## 参考ドキュメント

- [README.md](README.md) — ゲーム仕様
- [docs/design.md](docs/design.md) — 設計判断の索引
  - [docs/world.md](docs/world.md) — ワールド構造
  - [docs/rendering.md](docs/rendering.md) — レンダリング
  - [docs/game-loop.md](docs/game-loop.md) — ゲームループ
  - [docs/concurrency.md](docs/concurrency.md) — Web Worker
  - [docs/storage.md](docs/storage.md) — IndexedDB
  - [docs/textures.md](docs/textures.md) — テクスチャ仕様
- [.claude/skills/add-block/](.claude/skills/add-block/SKILL.md) — ブロック追加手順
- [.claude/skills/tdd/](.claude/skills/tdd/SKILL.md) — TDD サイクル
