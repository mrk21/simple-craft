# ワールドデータの保存

全体索引は [design.md](design.md)。

## 保存先: IndexedDB

**選定理由**

- 容量: 数百MB〜数GB（localStorage の 5-10MB では不足）
- 非同期: メインスレッドをブロックしない
- Worker からもアクセス可
- OPFS の方が速いが、API が新しめで今は IndexedDB で十分

## 差分のみ保存

**最重要の設計判断**: ワールドはシードから決定論的に再生成できる。
だから保存するのは:

- シード値
- プレイヤーの編集差分（壊した・置いた）
- プレイヤー状態（位置・インベントリ）

地形そのものは**絶対に保存しない**。無編集なら保存サイズ ≒ 0。

## スキーマ

```
DB: "simple-craft"

store: "meta"
  - { key: "seed",   value: number }
  - { key: "player", value: { pos, inv, ... } }

store: "modifications"
  - { key: "0,0",   value: { "5,64,3": 0, "5,65,3": 2, ... } }
  - { key: "1,0",   value: { ... } }
  - chunkX,chunkZ ごとに編集座標 → ブロックID のMap
```

## ロード手順

1. シードを取得
2. 必要なチャンクを Worker で再生成
3. modifications から該当チャンクの差分を引いて上書き
4. メッシュ構築

## セーブ手順

- ブロック編集のたびに該当チャンクの差分Map を更新
- DB 書き込みは **500ms 程度デバウンス**（編集連打時の負荷軽減）
- チャンク丸ごと書き戻さない（差分の追加更新のみ）

## 将来検討

- 圧縮: `CompressionStream`（ブラウザ標準 gzip）で差分Map を圧縮。当面不要
- エクスポート: meta + modifications を1つの Blob にまとめてダウンロード
- マルチワールド: DB 名 or store prefix で分離

## Minecraft本家との違い

本家は NBT + リージョンファイルで地形を全保存。これは village や mob、ランダムティック累積など**非決定的な状態**があるため必要。simple-craft はそれらを持たないので差分方式で完結する。
