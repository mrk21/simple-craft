# ゲームループ

全体索引は [design.md](design.md)。

## 基本方針: 固定タイムステップ + 可変描画

物理（プレイヤー移動・衝突）は固定ステップ、描画はモニタリフレッシュレートに合わせて可変。

**理由**

- 固定ステップにしないと、30fps と 120fps でジャンプ高さなど挙動が変わる
- 大きな `dt` で衝突判定するとブロックをすり抜ける（トンネリング）
- 決定論性が保てるとリプレイや再現バグ調査が楽

```ts
const FIXED_DT = 1 / 60;     // 物理は60Hz固定
const MAX_FRAME_DT = 0.25;   // タブ復帰時等の暴走防止クランプ

let lastTime = performance.now();
let accumulator = 0;

function frame(now: number) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, MAX_FRAME_DT);

  input.poll();

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);          // 物理・プレイヤー（固定ステップ）
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;
  render(alpha);               // 描画（補間でカクつき消し）

  requestAnimationFrame(frame);
}
```

Three.js の `renderer.setAnimationLoop(frame)` を使うと将来 WebXR 対応時に有利。

## 1フレームでやること

```
1. 入力ポーリング（キー・マウス状態を更新）
2. プレイヤー物理（固定ステップループ内）
   - 速度更新（重力・摩擦）
   - AABB 衝突判定（軸ごとに分離して解決）
3. チャンクのロード/アンロード判定
4. Worker から完成したメッシュを受信 → シーンに追加
5. レイキャスト（カーソル先のブロック判定、必要時）
6. 描画 (renderer.render)
```

## パフォーマンス対策

- **チャンクロード判定は毎フレームしない**: プレイヤーが1ブロック移動するごと等のイベントベースに
- **メッシュのシーン追加は1フレーム最大N個に制限**: 受信メッシュを全部即追加するとカクつく
- **レイキャストは必要時のみ**: 常時カーソル先を判定せず、ホバー表示時・クリック時に限定

## Visibility API

タブを非表示にすると rAF は止まる。復帰時に `dt` が巨大になる事故は `MAX_FRAME_DT` クランプで防いでいる。明示的にポーズしたい場合は `visibilitychange` で `paused` フラグを立てて update をスキップ。

## 入力管理

- **キーボード**: `keydown` / `keyup` で `Set<string>` に状態保持、update で参照
- **マウス移動**: `pointerlockchange` + `mousemove` で相対移動量を蓄積
- **クリック**: イベント発火時にフラグを立て、次の update で消費してリセット
