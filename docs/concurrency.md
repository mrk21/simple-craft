# 並列化（Web Workers）

全体索引は [design.md](design.md)。

## 動機

ブラウザでも Web Worker は本物の OS スレッド。地形生成・meshing は数値計算の塊なのでメインスレッドから逃がす。

## Worker プール

- サイズ: `navigator.hardwareConcurrency`（通常 4〜16）
- ジョブキューに「必要なチャンク」を積んで、空いた Worker に投げる
- **プレイヤーから近い順に優先度ソート**（移動時の体感改善）

## Transferable Objects

`postMessage` のデフォルトはコピー → 遅い。
ArrayBuffer は Transferable で渡して所有権だけ移動:

```ts
worker.postMessage({ blocks: buffer }, [buffer]);
```

メインスレッド側では受け取った Buffer をそのまま `BufferGeometry.setAttribute` に流せる。

## Worker のインターフェース

純粋関数として書く:

```
入力: { chunkX, chunkZ, seed }
  ↓
① noise → heightmap (Uint8Array)
② heightmap → blocks (Uint8Array)
③ blocks → mesh data
   - positions (Float32Array)
   - normals   (Float32Array)
   - uvs       (Float32Array)
   - indices   (Uint32Array)
   - colors    (Uint8Array, AO用)
  ↓
出力: 上記 ArrayBuffer を Transfer で返す
```

副作用なし・グローバル状態なし。これだとテストも書きやすいし、後で wasm 化する時もインターフェースが変わらない。

## 段階的移行

最初から全部 Worker に分けると設計が複雑になる。**「重くなってから移す」が正解**:

1. 全部メインスレッドで動かす（数チャンクなら問題ない）
2. フレーム落ちが見えたら**生成だけ** Worker に移す
3. それでも足りなければ **meshing も** Worker へ
4. さらに必要なら **wasm 化**（Rust 等）

データ構造は最初から TypedArray にしておくことで、移行コストを下げる。

## WebGL との関係

Worker から WebGL は直接触れない。OffscreenCanvas で描画自体を Worker 化することも可能だが、ゲームでは旨味が薄い。Worker は「**データを作るところまで**」担当する分業に徹する。

## ゲームループとの連携

Worker からの完成メッシュは「受信キュー」に積み、ゲームループの1フレームで上限 N 個までシーンに追加する。詳細は [game-loop.md](game-loop.md) 参照。
