import {
  ATLAS_H,
  ATLAS_W,
  TEX_SIZE,
  textureSlotFor,
  uvBoxForSlot,
} from "../render/atlas";
import type { BlockId } from "../world/block";

// ============================================================
// インベントリ用のブロックアイコン（2:1 アイソメトリック 3 面）
// ============================================================

// (a, b, c, d, e, f) で単位正方形 (0..1)^2 をアトラスタイルの 16×16 から
// アイコン上のパラレログラムへマップする。drawImage が現在 transform を尊重するため
// setTransform でセットした後 drawImage(atlas, sx, sy, 16, 16, 0, 0, 1, 1) で投影できる
function drawFace(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  block: BlockId,
  faceIndex: number,
  brightness: number,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  const box = uvBoxForSlot(textureSlotFor(block, faceIndex));
  const sx = box.u0 * ATLAS_W;
  const sy = box.v0 * ATLAS_H;
  ctx.setTransform(a, b, c, d, e, f);
  ctx.filter = brightness === 1 ? "none" : `brightness(${brightness})`;
  ctx.drawImage(atlas, sx, sy, TEX_SIZE, TEX_SIZE, 0, 0, 1, 1);
}

// size × size の正方形にブロックを 2:1 アイソメトリックで描く
// 面のキャップ: +Y=上, -X=左, +X=右（mesher の FACES と対応）
export function drawBlockIcon(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  block: BlockId,
  size: number,
): void {
  const S = size;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.clearRect(0, 0, S, S);

  // 上面 +Y: 単位正方形 (0..1)^2 を 上=(S/2,0)・右=(S,S/4)・下=(S/2,S/2)・左=(0,S/4) のひし形へ
  //   (0,0)→back-left=(S/2,0), (1,0)→back-right=(S,S/4), (0,1)→front-left=(0,S/4), (1,1)→front-right=(S/2,S/2)
  drawFace(ctx, atlas, block, 2, 1.0,
    S / 2, S / 4,
    -S / 2, S / 4,
    S / 2, 0);

  // 左面 -X: (0,0)→top-back=(0,S/4), (1,0)→top-front=(S/2,S/2), (0,1)→bottom-back=(0,3S/4), (1,1)→bottom-front=(S/2,S)
  drawFace(ctx, atlas, block, 1, 0.75,
    S / 2, S / 4,
    0, S / 2,
    0, S / 4);

  // 右面 +X: (0,0)→top-front=(S/2,S/2), (1,0)→top-back=(S,S/4), (0,1)→bottom-front=(S/2,S), (1,1)→bottom-back=(S,3S/4)
  drawFace(ctx, atlas, block, 0, 0.88,
    S / 2, -S / 4,
    0, S / 2,
    S / 2, S / 2);

  // transform/filter を元に戻す
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
}

// ブロック → data URL を生成（背景画像として CSS に使える）。block ごとに 1 回だけ生成しキャッシュ
const iconCache = new Map<string, string>();

export function getBlockIconUrl(
  atlas: HTMLCanvasElement,
  block: BlockId,
  size: number,
): string {
  const key = `${block}@${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  drawBlockIcon(ctx, atlas, block, size);
  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}
