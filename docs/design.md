# Simple Craft 設計ドキュメント

ゲーム仕様は [README.md](../README.md)、エージェント向け制約サマリは [CLAUDE.md](../CLAUDE.md) を参照。
本ドキュメントは**なぜそう決めたか**の記録。

## トピック別ドキュメント

| 領域         | ファイル                         | 内容                                       |
| ------------ | -------------------------------- | ------------------------------------------ |
| ワールド構造 | [world.md](world.md)             | チャンク分割、生成パイプライン、境界処理   |
| 地形生成     | [terrain.md](terrain.md)         | ノイズチャネル合成、決定論、パラメータ調整 |
| レンダリング | [rendering.md](rendering.md)     | マテリアル、Greedy Meshing、AO、水・透明度 |
| ゲームループ | [game-loop.md](game-loop.md)     | 固定タイムステップ、入力、Visibility API   |
| 並列化       | [concurrency.md](concurrency.md) | Worker プール、Transferable、wasm 移行パス |
| 保存         | [storage.md](storage.md)         | IndexedDB、差分のみ保存、スキーマ          |
| テクスチャ   | [textures.md](textures.md)       | 仕様、構成、AI 生成プロンプト              |

実装手順系の skill:

- [.claude/skills/add-block/](../.claude/skills/add-block/SKILL.md) — 新ブロック追加（テクスチャ・コード更新箇所）
- [.claude/skills/tdd/](../.claude/skills/tdd/SKILL.md) — TDD サイクル、テスト戦略

---

## 1. 技術スタック

### 採用: Vite + TypeScript + Three.js

**選定理由**

- Three.js は WebGL ライブラリで最も資料・サンプルが豊富。voxel 系の参考実装も多い
- TypeScript はチャンク座標・ブロックID など型がある方が事故が減る領域
- Vite は HMR と Worker サポートが標準で速い

**検討した代替案**

- **Babylon.js**: ゲームエンジン色が強く物理も同梱だが、voxel の低レベル制御では Three.js のシンプルさが勝つ
- **生 WebGL**: 学習目的なら良いが、シェーダ・カメラ・テクスチャの土台で時間が溶ける。ゲーム部分に集中したいので不採用
- **PlayCanvas**: エディタ前提で重い

### 補助ライブラリ

- `simplex-noise`: シード対応・Perlin より縞が出にくい
- `idb`: IndexedDB の薄い Promise ラッパー。生 API は煩雑
- `vitest`: テストランナー。Vite と統合され設定がほぼ不要

物理は当面**自前の AABB 判定**で実装。Minecraft 風の歩行+ブロック衝突なら数百行で書ける。必要になれば `rapier3d` 検討。

---

## 2. ディレクトリ構成

```
simple-craft/
├── README.md                  ゲーム仕様
├── CLAUDE.md                  エージェント向け制約サマリ
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                 エントリHTML（Vite規約でルートに置く）
├── .gitignore
│
├── .claude/
│   └── skills/                プロジェクト固有の作業手順
│       ├── add-block/
│       └── tdd/
│
├── docs/
│   ├── design.md              本ドキュメント（索引 + 全体方針）
│   ├── world.md               ワールド構造
│   ├── rendering.md           レンダリング
│   ├── game-loop.md           ゲームループ
│   ├── concurrency.md         Web Worker
│   ├── storage.md             IndexedDB
│   └── textures.md            ブロックテクスチャ
│
├── public/                    ビルド時にそのままコピーされる静的ファイル
│   └── textures/
│       ├── atlas.png          ビルド済みアトラス
│       └── blocks/            個別テクスチャ（AI生成の原本）
│           ├── grass_top.png
│           ├── grass_side.png
│           ├── grass_bottom.png
│           ├── stone.png
│           ├── sand.png
│           └── water.png
│
└── src/
    ├── main.ts                エントリポイント。シーン構築 + ループ開始
    │
    ├── core/                  フレームワーク的な土台
    │   ├── loop.ts            固定ステップループ
    │   ├── input.ts           キー・マウス状態
    │   ├── camera.ts          一人称カメラ + pointer lock
    │   └── clock.ts           経過時間管理
    │
    ├── world/                 ワールドのデータモデル
    │   ├── block.ts           ブロックID定義・性質テーブル
    │   ├── chunk.ts           チャンクのデータ構造
    │   ├── world.ts           チャンクMap管理・座標変換
    │   ├── generator.ts       noise + 配置ロジック（Workerからimport）
    │   └── prng.ts            シード対応の決定論PRNG
    │
    ├── render/                描画
    │   ├── mesher.ts          ブロック→BufferGeometry（Greedy + AO）
    │   ├── atlas.ts           UV計算・アトラス情報
    │   ├── materials.ts       不透明用・水用マテリアル定義
    │   └── shaders/
    │       └── water.glsl     水の頂点シェーダ
    │
    ├── workers/               Web Worker
    │   ├── chunk.worker.ts    生成+meshingの本体
    │   └── pool.ts            main側のWorkerプール管理
    │
    ├── game/                  ゲームロジック
    │   ├── player.ts          プレイヤー状態
    │   ├── physics.ts         AABB衝突解決
    │   ├── interaction.ts     ブロック設置/破壊・レイキャスト
    │   └── update.ts          1tickの統合
    │
    └── storage/               永続化
        ├── db.ts              IndexedDB初期化
        ├── modifications.ts   編集差分の読み書き
        └── meta.ts            シード・プレイヤー状態の読み書き
```

### 補足

**Vite 規約**

- `index.html` は**プロジェクトルート**に置く
- `public/` の中身は URL でそのまま参照可能（`/textures/atlas.png`）
- `src/` 内のアセットを `import` した場合はビルド時にバンドル

**Worker の読み込み**

- `new Worker(new URL('./workers/chunk.worker.ts', import.meta.url), { type: 'module' })`
- ファイル名は `*.worker.ts` 慣習で一目で分かるように

**`world/` と `workers/` の関係**

- `world/generator.ts` は純粋関数で `workers/chunk.worker.ts` から呼ばれる
- main thread からも直接呼べるようにしておくとデバッグが楽

**シェーダの持ち方**

- GLSL は `.glsl` 別ファイルで持ち、Vite の `?raw` インポートで文字列として読む

  ```ts
  import waterVert from './shaders/water.vert?raw';
  ```

- インラインのバッククォート文字列より、シンタックスハイライトが効いて読みやすい

**アトラスのビルド**

- 個別テクスチャを `public/textures/blocks/` に置く
- ビルド時にスクリプトで結合 → `public/textures/atlas.png` を生成
- 開発初期は手作業で結合 PNG を置いても OK

---

## 3. 将来の拡張パス

設計上、以下は後付け可能な形にしてある:

### マルチプレイ / デバイス間同期

- 保存層を IndexedDB から API クライアントに差し替え
- 差分 Map のスキーマはそのまま使える
- ただしリアルタイム編集の衝突解決は別途設計が必要

### バイオーム

- ブロックパレットの拡張だけでなく、テクスチャ tinting の導入が必要
- マテリアルを `MeshLambertMaterial` から `ShaderMaterial` / `onBeforeCompile` に切り替え

### 洞窟

- 3D ノイズ（現在は2D ヘイトマップのみ）を追加
- Worker のジェネレータに段階追加するだけで本体は変更不要

### wasm 化

- Worker のインターフェース（入力: 値、出力: ArrayBuffer）が同じなら差し替え可能
- noise と meshing が候補
