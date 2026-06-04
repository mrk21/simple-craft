import * as THREE from "three";
import { BLOCK, type BlockId } from "../world/block";

// ============================================================
// アトラスのレイアウト（純粋関数のみ）
// ============================================================

export const TEX_SIZE = 16;
// アトラス境界での隣接タイル滲み防止のため、各タイルの周囲に 1px のエッジ複製パディングを置く
export const PADDING = 1;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

const TILE_STRIDE = TEX_SIZE + PADDING * 2;
export const ATLAS_W = ATLAS_COLS * TILE_STRIDE;
export const ATLAS_H = ATLAS_ROWS * TILE_STRIDE;

export const TEX = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
} as const;
export type TexSlot = (typeof TEX)[keyof typeof TEX];

export interface UvBox {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

// スロット → アトラス上の UV 矩形（v は canvas Y と同方向: v=0 が上端）
export function uvBoxForSlot(slot: TexSlot): UvBox {
  const col = slot % ATLAS_COLS;
  const row = Math.floor(slot / ATLAS_COLS);
  const px0 = col * TILE_STRIDE + PADDING;
  const py0 = row * TILE_STRIDE + PADDING;
  return {
    u0: px0 / ATLAS_W,
    v0: py0 / ATLAS_H,
    u1: (px0 + TEX_SIZE) / ATLAS_W,
    v1: (py0 + TEX_SIZE) / ATLAS_H,
  };
}

// (BlockId, faceIndex) → どのテクスチャスロットを描くか
// faceIndex は mesher の FACES 配列の順: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
export function textureSlotFor(blockId: BlockId, faceIndex: number): TexSlot {
  if (blockId === BLOCK.GRASS) {
    if (faceIndex === 2) return TEX.GRASS_TOP;
    if (faceIndex === 3) return TEX.DIRT;
    return TEX.GRASS_SIDE;
  }
  if (blockId === BLOCK.SAND) return TEX.SAND;
  if (
    blockId === BLOCK.WATER ||
    blockId === BLOCK.WATER_F1 ||
    blockId === BLOCK.WATER_F2 ||
    blockId === BLOCK.WATER_F3
  ) {
    return TEX.WATER;
  }
  return TEX.STONE;
}

// 各面の 4 コーナーに割り当てる UV の (u, v) 局所座標（0..1）
// mesher の FACES 配列のコーナー順序に合わせて定義
// v=0 が「テクスチャ上端」（canvas y=0 / flipY=false 前提）
export const FACE_UV_CORNERS: readonly (readonly (readonly [number, number])[])[] = [
  // +X 側面: corners[0]=lower-near, [1]=upper-near, [2]=upper-far, [3]=lower-far
  [[0, 1], [0, 0], [1, 0], [1, 1]],
  // -X 側面
  [[0, 1], [0, 0], [1, 0], [1, 1]],
  // +Y 上面（真上から見下ろし）
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  // -Y 下面
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  // +Z 側面
  [[0, 1], [0, 0], [1, 0], [1, 1]],
  // -Z 側面
  [[0, 1], [0, 0], [1, 0], [1, 1]],
];

// ============================================================
// プロシージャル・ペインタ（Canvas 依存。main thread のみで呼ぶ）
// ============================================================

// 位置ベースの決定論的ハッシュ。同じ (x, y, salt) → 同じ 0..0xFFFFFFFF
function hash2d(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393);
  h = (h + Math.imul(y | 0, 668265263)) | 0;
  h = (h + Math.imul(salt | 0, 1274126177)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.floor(v);
}

function setPixel(
  data: Uint8ClampedArray,
  atlasW: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const i = (y * atlasW + x) * 4;
  data[i] = clamp8(r);
  data[i + 1] = clamp8(g);
  data[i + 2] = clamp8(b);
  data[i + 3] = clamp8(a);
}

function copyPixel(
  data: Uint8ClampedArray,
  atlasW: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): void {
  const s = (sy * atlasW + sx) * 4;
  const d = (dy * atlasW + dx) * 4;
  data[d] = data[s];
  data[d + 1] = data[s + 1];
  data[d + 2] = data[s + 2];
  data[d + 3] = data[s + 3];
}

type Painter = (
  data: Uint8ClampedArray,
  atlasW: number,
  ox: number,
  oy: number,
) => void;

const paintStone: Painter = (data, atlasW, ox, oy) => {
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = hash2d(x, y, 31) % 40;
      const v = 110 + n;
      // たまに濃い目のグレーで岩肌のひび風
      const dark = hash2d(x, y, 32) % 100 < 5 ? -20 : 0;
      setPixel(data, atlasW, ox + x, oy + y, v + dark, v + dark, v + dark, 255);
    }
  }
};

const paintDirt: Painter = (data, atlasW, ox, oy) => {
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash2d(x, y, 47) % 40) - 20;
      // たまに小石風の濃いめドット
      const speck = hash2d(x, y, 48) % 100 < 4 ? -30 : 0;
      setPixel(
        data,
        atlasW,
        ox + x,
        oy + y,
        120 + n + speck,
        82 + n * 0.7 + speck,
        52 + n * 0.5 + speck,
        255,
      );
    }
  }
};

const paintSand: Painter = (data, atlasW, ox, oy) => {
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash2d(x, y, 53) % 28) - 14;
      // たまに濃いめの粒
      const speck = hash2d(x, y, 54) % 100 < 5 ? -25 : 0;
      setPixel(
        data,
        atlasW,
        ox + x,
        oy + y,
        220 + n + speck,
        200 + n + speck,
        140 + n + speck,
        255,
      );
    }
  }
};

const paintGrassTop: Painter = (data, atlasW, ox, oy) => {
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash2d(x, y, 17) % 40) - 12;
      // 濃い緑のパッチ
      const dark = hash2d(x, y, 18) % 100 < 7 ? -25 : 0;
      setPixel(
        data,
        atlasW,
        ox + x,
        oy + y,
        85 + n * 0.4 + dark * 0.4,
        160 + n + dark,
        60 + n * 0.3 + dark * 0.3,
        255,
      );
    }
  }
};

// 草ブロックの側面: 上端数行が緑、下が土。境界は列ごとにぎざぎざ
const paintGrassSide: Painter = (data, atlasW, ox, oy) => {
  const grassRows = 3; // 確実に緑の行
  const edgeRow = 3; // ぎざぎざ境界
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      let isGrass: boolean;
      if (y < grassRows) {
        isGrass = true;
      } else if (y === edgeRow) {
        isGrass = hash2d(x, 0, 23) % 2 === 0;
      } else if (y === edgeRow + 1) {
        // たまにもう一行下に伸びる
        isGrass = hash2d(x, 0, 29) % 5 === 0;
      } else {
        isGrass = false;
      }

      if (isGrass) {
        const n = (hash2d(x, y, 17) % 40) - 12;
        const dark = hash2d(x, y, 18) % 100 < 7 ? -25 : 0;
        setPixel(
          data,
          atlasW,
          ox + x,
          oy + y,
          85 + n * 0.4 + dark * 0.4,
          160 + n + dark,
          60 + n * 0.3 + dark * 0.3,
          255,
        );
      } else {
        const n = (hash2d(x, y, 47) % 40) - 20;
        const speck = hash2d(x, y, 48) % 100 < 4 ? -30 : 0;
        setPixel(
          data,
          atlasW,
          ox + x,
          oy + y,
          120 + n + speck,
          82 + n * 0.7 + speck,
          52 + n * 0.5 + speck,
          255,
        );
      }
    }
  }
};

const paintWater: Painter = (data, atlasW, ox, oy) => {
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const n = (hash2d(x, y, 71) % 24) - 8;
      // 横方向の波風グラデーション
      const wave = Math.floor(Math.sin((x + y * 0.5) * 0.6) * 6);
      setPixel(
        data,
        atlasW,
        ox + x,
        oy + y,
        50 + n * 0.3 + wave * 0.5,
        110 + n * 0.6 + wave,
        200 + n + wave,
        255,
      );
    }
  }
};

const PAINTERS: Record<TexSlot, Painter> = {
  [TEX.GRASS_TOP]: paintGrassTop,
  [TEX.GRASS_SIDE]: paintGrassSide,
  [TEX.DIRT]: paintDirt,
  [TEX.STONE]: paintStone,
  [TEX.SAND]: paintSand,
  [TEX.WATER]: paintWater,
};

// タイルの外周 1px に「自分自身のエッジを複製した枠」を書く
function replicateEdges(
  data: Uint8ClampedArray,
  atlasW: number,
  ox: number,
  oy: number,
): void {
  // 上下の行（角含む）
  for (let dx = -1; dx <= TEX_SIZE; dx++) {
    const sx = dx < 0 ? 0 : dx >= TEX_SIZE ? TEX_SIZE - 1 : dx;
    copyPixel(data, atlasW, ox + sx, oy, ox + dx, oy - 1);
    copyPixel(data, atlasW, ox + sx, oy + TEX_SIZE - 1, ox + dx, oy + TEX_SIZE);
  }
  // 左右の列（角は上下処理で既に埋まっている）
  for (let dy = 0; dy < TEX_SIZE; dy++) {
    copyPixel(data, atlasW, ox, oy + dy, ox - 1, oy + dy);
    copyPixel(data, atlasW, ox + TEX_SIZE - 1, oy + dy, ox + TEX_SIZE, oy + dy);
  }
}

export function buildAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(ATLAS_W, ATLAS_H);
  const data = img.data;

  const slots: TexSlot[] = [
    TEX.GRASS_TOP,
    TEX.GRASS_SIDE,
    TEX.DIRT,
    TEX.STONE,
    TEX.SAND,
    TEX.WATER,
  ];
  for (const slot of slots) {
    const col = slot % ATLAS_COLS;
    const row = Math.floor(slot / ATLAS_COLS);
    const ox = col * TILE_STRIDE + PADDING;
    const oy = row * TILE_STRIDE + PADDING;
    PAINTERS[slot](data, ATLAS_W, ox, oy);
    replicateEdges(data, ATLAS_W, ox, oy);
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function buildAtlasTexture(): THREE.CanvasTexture {
  const canvas = buildAtlasCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false; // canvas Y と UV V を揃える
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
