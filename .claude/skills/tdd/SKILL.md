---
name: tdd
description: simple-craft で純粋ロジック（地形生成・meshing・AABB物理・PRNG・保存層の差分マージ・座標変換）を実装する時に使う。t-wada 流の古典的 TDD（Red-Green-Refactor、テストリスト、仮実装と三角測量）、Vitest の使い方、決定論性テスト、TypedArray のテスト手法。Three.js のシーン構築や DOM ハンドラなど副作用主体のコードでは使わない。
---

# TDD で実装する（t-wada 流）

このプロジェクトの TDD は **t-wada（和田卓人）流の古典的 TDD** に従う。Kent Beck の『テスト駆動開発』の進め方を踏襲する流派。

## t-wada 流の核となる原則

1. **テストリストを最初に書く**
   - 実装に入る前に「これから書くテストの一覧」を箇条書きで列挙する
   - 思いついたら追加、終わったらチェック。並び替えてもよい
   - 「次に何をテストするか」を常に小さい単位で選ぶ
2. **一度に1つのテストだけ書く**
   - 同時に複数の失敗テストを抱えない
   - 1つ Red → Green → Refactor のサイクルを回し切ってから次へ
3. **失敗を確認してから実装する**
   - Red を一度目で見ること。最初から緑にしない
   - 「失敗の理由が想定通り」を必ず確認する
4. **Green への進め方を3つ使い分ける**
   - **仮実装 (Fake it)**: ベタ書きの定数を返してとりあえず通す。先が見えない時の足がかり
   - **三角測量 (Triangulation)**: 2つ目のテストを書いて一般化を強制する
   - **明白な実装 (Obvious Implementation)**: 自明な時は最初から本実装。ただし途中で詰まったら仮実装に戻る
5. **リファクタリングは緑のまま**
   - テストが赤い状態でリファクタリングしない
   - 重複の除去・命名・構造化を1ステップずつ
6. **テスト名は仕様を表す**
   - `test_foo` ではなく `同じシードで同じ heightmap が生成される` のように、満たすべき仕様を日本語/英語の文で書く
7. **「テストファースト」と「TDD」を区別する**
   - テストを先に書くだけが TDD ではない。**Red を経由する**ことと**リファクタリングを含む**ことがセット
   - 「先にテストを書いて、まとめて実装して、まとめて通す」のは TDD ではない

## 適用範囲

**TDD で書くもの（純粋関数 = 入力 → 出力）**

- 地形生成: noise、heightmap、ブロック配置ロジック
- メッシュ生成: Greedy meshing、AO 計算、UV 計算
- AABB 物理: 衝突解決、軸ごとの分離
- PRNG: 決定論性の検証
- 保存層: 差分マージ、シリアライズ/デシリアライズ
- 座標変換: ワールド ⇔ チャンク ⇔ ローカル ⇔ 配列インデックス

**TDD で書かないもの（副作用主体）**

- Three.js のシーン構築・カメラ・ライト
- DOM・入力イベントのハンドラ
- main エントリ・ゲームループのつなぎ込み
- IndexedDB の生 API 呼び出し（ラッパー越しなら可）

→ 「入力 → 出力」が表現できるものは TDD、そうでないものは手動検証で OK。

## サイクル

1. **Red**: 失敗するテストを1つ書き、**実行して失敗を確認**する
2. **Green**: 最小限の実装で通す（仮実装でも可）
3. **Refactor**: 重複を取り、命名を整え、構造を改善（テストは緑のまま）

1サイクルは10分以内が目安。長くなったらテストの粒度が大きすぎる。

### Green への進め方の使い分け

- **詰まった / 見通しが立たない** → 仮実装（定数を返す）で一度緑にし、2つ目のテストで一般化（三角測量）
- **実装が自明** → 明白な実装で直接書いてよい。ただし手が止まったら仮実装に戻る
- 仮実装は**気持ち悪さに耐える勇気**が肝心。「こんなのテスト通すだけだ」と思っても、緑のリズムを優先する

### テストリストの運用

実装開始時に以下のような箇条書きを TODO として持つ:

```
- [ ] 同じシード+座標で同じ heightmap が出る
- [ ] シードが違えば結果が変わる
- [ ] 値域が [0, MAX_HEIGHT] に収まる
- [ ] 隣接座標で滑らかに変化する（差分が閾値以下）
- [ ] 原点付近の特定座標が期待値（リグレッション固定）
```

1つ終わったらチェック、新しいケースを思いついたら追加。一度に複数着手しない。

## ツール

### Vitest を採用

- Vite ネイティブで設定がほぼゼロ（TS・ESM・Worker・top-level await がそのまま動く）
- Jest 互換 API（`describe` / `test` / `expect`）
- watch モードが速い

**Jest を採用しない理由**: Vite プロジェクトに Jest を入れると ESM/TS の設定が大量に必要で破綻する。Vitest 一択。

### ファイル配置

- `*.test.ts` をソースファイルの**隣**に置く
- 例: `src/world/generator.ts` ⇔ `src/world/generator.test.ts`

### インストール

```sh
npm i -D vitest
# カバレッジが欲しい時のみ
npm i -D @vitest/coverage-v8
# DOM 環境が必要な時のみ
npm i -D jsdom
```

### 最小設定（`vite.config.ts`）

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',  // デフォルトは node（DOM 不要）
  },
});
```

`package.json` の scripts:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### environment の切り替え

DOM が必要なテスト（ほぼないはず）はファイル冒頭で個別に指定:

```ts
// @vitest-environment jsdom
import { test, expect } from 'vitest';
// ...
```

simple-craft では地形生成・meshing・物理・PRNG・差分マージ・座標変換が中心なので、ほぼ全てのテストは `node` 環境で完結する。

### 周辺ライブラリ（不要なもの）

- **Three.js モック**: 不要。Three.js はテストしない方針
- **Worker テスト用ヘルパー**: 不要。Worker の中身は純粋関数として `import` して直接テスト
- **Sinon 等のモックライブラリ**: 不要。Vitest 同梱の `vi.fn()` で十分

### 推奨スクリプト運用

開発中は `npm test`（watch モード）を別ターミナルで常時起動し、テストが赤くなったら即気付ける状態を維持する。CI では `npm run test:run`（1回実行で終了）。

## よくあるテストパターン

### 決定論性

シードベースの関数は**同じ入力 → 同じ出力**が必ず成り立つ:

```ts
test('同じシードで同じ heightmap が生成される', () => {
  const a = generateHeightmap(0, 0, 12345);
  const b = generateHeightmap(0, 0, 12345);
  expect(a).toEqual(b);
});

test('シードが変われば結果が変わる', () => {
  const a = generateHeightmap(0, 0, 12345);
  const b = generateHeightmap(0, 0, 67890);
  expect(a).not.toEqual(b);
});
```

これだけでもリグレッションを大きく減らせる。

### TypedArray の検証

`Uint8Array` 等の比較は `toEqual` で内容比較される:

```ts
test('境界のブロックは石になる', () => {
  const blocks = generateChunk(0, 0, 12345);
  expect(blocks[idx(0, 0, 0)]).toBe(BLOCK.STONE);
});
```

全配列を一致比較する代わりに、特定インデックスやヒストグラム（種類ごとのカウント）でアサートすると壊れにくい。

### 座標変換の往復

```ts
test('ワールド座標 → ローカル → ワールド で元に戻る', () => {
  const w = { x: 137, y: 64, z: -42 };
  const local = worldToLocal(w);
  const back = localToWorld(local);
  expect(back).toEqual(w);
});
```

### AABB 衝突

「衝突する/しない」のペアを最小ケースで列挙。軸ごとに分離するロジックなら**軸ごとに別テスト**を書く。

## やらないこと

- **モック地獄を作らない**: Three.js のオブジェクトをモックしてまでテストしない。テストできない設計だと感じたら、純粋関数を取り出す方を優先
- **カバレッジ100%を目指さない**: 副作用主体のコードは手動検証に任せる
- **複雑なテストヘルパーを早めに作らない**: 同じセットアップが3回出てから抽出を検討

## 関連ドキュメント

- [docs/world.md](../../../docs/world.md) — チャンクデータ構造
- [docs/rendering.md](../../../docs/rendering.md) — メッシュ生成
- [docs/storage.md](../../../docs/storage.md) — 差分マージ
