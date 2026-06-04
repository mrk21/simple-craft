# レンダリング

全体索引は [design.md](design.md)。

## マテリアル戦略

**段階的に複雑化する方針:**

1. **初期**: `MeshLambertMaterial` + アトラスのみ（シェーダなし）
2. **AO 追加時**: メッシュ側で頂点カラーに焼き込む、マテリアルは `vertexColors: true`
3. **水・演出**: `ShaderMaterial` または `onBeforeCompile` で必要分だけ

シェーダから書き始めるのではなく、**動くものを作ってから演出を足す**順序を守る。

## Greedy Meshing

1ブロック=1キューブで描くとチャンクあたり数万面になり死ぬ。
最低限「見えない面（隣接ブロックが不透明）を出さない」カリングは初期から実装する。
Greedy Meshing（同一テクスチャの連続面をマージ）は早めに入れる価値がある。

メッシュ生成は Worker 側で行う。インターフェースは [concurrency.md](concurrency.md) 参照。

## Ambient Occlusion

ブロック角の陰影。**シェーダではなくメッシュ生成側**で焼き込む:

- 各頂点について「周囲3ブロックの埋まり具合」を 0-3 で算出
- 頂点カラー（明度）に変換
- フラグメントシェーダは `texture * vertexColor` で済む

この方式は Minecraft 公式とほぼ同じアプローチ。

## テクスチャアトラス

- 全ブロック・全面を 1枚の PNG にパック
- 各面の UV はメッシュ生成時に計算
- `NearestFilter`、mipmap 無効
- アトラス境界の滲み対策で 1px パディングを入れる

テクスチャ自体の仕様は [textures.md](textures.md) 参照。

## 水と透明度

- 不透明ブロックと水でメッシュを分離
- 不透明 → 水 の順で描画
- `material.transparent = true`、`depthWrite = false`
- 表面の揺らぎは `ShaderMaterial` の頂点シェーダで実装（time uniform）

## ライティング

- `DirectionalLight` × 1（太陽光）
- `AmbientLight` × 1（弱め）
- 動的影は当面なし（重い）。後で必要ならチャンクごとのシャドウマップ検討
- `THREE.Fog` を入れてチャンク境界の切れ目を隠す（無料の体感改善）
