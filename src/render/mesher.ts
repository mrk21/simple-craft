import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  idx,
} from '../world/chunk';
import {
  BLOCK,
  type BlockId,
  blockKind,
  isWaterBlock,
} from '../world/block';
import {
  FACE_UV_CORNERS,
  textureSlotFor,
  uvBoxForSlot,
} from './atlas';

export interface ChunkMesh {
  positions: Float32Array;
  normals: Float32Array;
  // 頂点カラーは AO 由来のグレースケール明度のみ（最終色はテクスチャ × 明度）
  colors: Uint8Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

// チャンク外の位置でブロックを問い合わせるためのコールバック。省略時は AIR 扱い。
export type NeighborBlockAt = (x: number, y: number, z: number) => BlockId;

type Vec3 = readonly [number, number, number];

interface FaceCorner {
  pos: Vec3;
  // AO 用の3隣接ブロック offset（face_neighbor 起点）
  // [side1, side2, cornerDiagonal]
  ao: readonly [Vec3, Vec3, Vec3];
}

interface Face {
  dx: number;
  dy: number;
  dz: number;
  normal: Vec3;
  corners: readonly [FaceCorner, FaceCorner, FaceCorner, FaceCorner];
}

// 6面定義。corners は外から見て CCW、各 corner に AO 用の3隣接 offset 付き
// 配列の順序は atlas.ts の FACE_UV_CORNERS と一致させる
const FACES: readonly Face[] = [
  // +X (right)
  {
    dx: 1, dy: 0, dz: 0, normal: [1, 0, 0],
    corners: [
      { pos: [1, 0, 0], ao: [[0, -1, 0], [0, 0, -1], [0, -1, -1]] },
      { pos: [1, 1, 0], ao: [[0, 1, 0], [0, 0, -1], [0, 1, -1]] },
      { pos: [1, 1, 1], ao: [[0, 1, 0], [0, 0, 1], [0, 1, 1]] },
      { pos: [1, 0, 1], ao: [[0, -1, 0], [0, 0, 1], [0, -1, 1]] },
    ],
  },
  // -X (left)
  {
    dx: -1, dy: 0, dz: 0, normal: [-1, 0, 0],
    corners: [
      { pos: [0, 0, 1], ao: [[0, -1, 0], [0, 0, 1], [0, -1, 1]] },
      { pos: [0, 1, 1], ao: [[0, 1, 0], [0, 0, 1], [0, 1, 1]] },
      { pos: [0, 1, 0], ao: [[0, 1, 0], [0, 0, -1], [0, 1, -1]] },
      { pos: [0, 0, 0], ao: [[0, -1, 0], [0, 0, -1], [0, -1, -1]] },
    ],
  },
  // +Y (top)
  {
    dx: 0, dy: 1, dz: 0, normal: [0, 1, 0],
    corners: [
      { pos: [0, 1, 1], ao: [[-1, 0, 0], [0, 0, 1], [-1, 0, 1]] },
      { pos: [1, 1, 1], ao: [[1, 0, 0], [0, 0, 1], [1, 0, 1]] },
      { pos: [1, 1, 0], ao: [[1, 0, 0], [0, 0, -1], [1, 0, -1]] },
      { pos: [0, 1, 0], ao: [[-1, 0, 0], [0, 0, -1], [-1, 0, -1]] },
    ],
  },
  // -Y (bottom)
  {
    dx: 0, dy: -1, dz: 0, normal: [0, -1, 0],
    corners: [
      { pos: [0, 0, 0], ao: [[-1, 0, 0], [0, 0, -1], [-1, 0, -1]] },
      { pos: [1, 0, 0], ao: [[1, 0, 0], [0, 0, -1], [1, 0, -1]] },
      { pos: [1, 0, 1], ao: [[1, 0, 0], [0, 0, 1], [1, 0, 1]] },
      { pos: [0, 0, 1], ao: [[-1, 0, 0], [0, 0, 1], [-1, 0, 1]] },
    ],
  },
  // +Z (front)
  {
    dx: 0, dy: 0, dz: 1, normal: [0, 0, 1],
    corners: [
      { pos: [1, 0, 1], ao: [[1, 0, 0], [0, -1, 0], [1, -1, 0]] },
      { pos: [1, 1, 1], ao: [[1, 0, 0], [0, 1, 0], [1, 1, 0]] },
      { pos: [0, 1, 1], ao: [[-1, 0, 0], [0, 1, 0], [-1, 1, 0]] },
      { pos: [0, 0, 1], ao: [[-1, 0, 0], [0, -1, 0], [-1, -1, 0]] },
    ],
  },
  // -Z (back)
  {
    dx: 0, dy: 0, dz: -1, normal: [0, 0, -1],
    corners: [
      { pos: [0, 0, 0], ao: [[-1, 0, 0], [0, -1, 0], [-1, -1, 0]] },
      { pos: [0, 1, 0], ao: [[-1, 0, 0], [0, 1, 0], [-1, 1, 0]] },
      { pos: [1, 1, 0], ao: [[1, 0, 0], [0, 1, 0], [1, 1, 0]] },
      { pos: [1, 0, 0], ao: [[1, 0, 0], [0, -1, 0], [1, -1, 0]] },
    ],
  },
];

// AO レベル 0-3 → 明度（最大 1.0 で 255 にマップ）
const AO_BRIGHTNESS = [0.5, 0.65, 0.8, 1.0];

function inChunk(x: number, y: number, z: number): boolean {
  return (
    x >= 0 && x < CHUNK_SIZE_X &&
    y >= 0 && y < CHUNK_SIZE_Y &&
    z >= 0 && z < CHUNK_SIZE_Z
  );
}

function blockAt(
  blocks: Uint8Array,
  cb: NeighborBlockAt | undefined,
  x: number,
  y: number,
  z: number,
): BlockId {
  if (inChunk(x, y, z)) return blocks[idx(x, y, z)] as BlockId;
  return cb ? cb(x, y, z) : BLOCK.AIR;
}

function isOpaqueAt(
  blocks: Uint8Array,
  cb: NeighborBlockAt | undefined,
  x: number,
  y: number,
  z: number,
): boolean {
  return blockKind(blockAt(blocks, cb, x, y, z)) === 'opaque';
}

function isAirAt(
  blocks: Uint8Array,
  cb: NeighborBlockAt | undefined,
  x: number,
  y: number,
  z: number,
): boolean {
  return blockKind(blockAt(blocks, cb, x, y, z)) === 'air';
}

function computeAo(
  blocks: Uint8Array,
  cb: NeighborBlockAt | undefined,
  fx: number,
  fy: number,
  fz: number,
  offsets: readonly [Vec3, Vec3, Vec3],
): number {
  const s1 = isOpaqueAt(blocks, cb, fx + offsets[0][0], fy + offsets[0][1], fz + offsets[0][2]) ? 1 : 0;
  const s2 = isOpaqueAt(blocks, cb, fx + offsets[1][0], fy + offsets[1][1], fz + offsets[1][2]) ? 1 : 0;
  const cn = isOpaqueAt(blocks, cb, fx + offsets[2][0], fy + offsets[2][1], fz + offsets[2][2]) ? 1 : 0;
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + cn);
}

export function meshChunk(
  blocks: Uint8Array,
  neighborBlockAt?: NeighborBlockAt,
): ChunkMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < CHUNK_SIZE_Y; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = blocks[idx(x, y, z)] as BlockId;
        if (blockKind(id) !== 'opaque') continue;

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dx;
          const ny = y + face.dy;
          const nz = z + face.dz;
          if (isOpaqueAt(blocks, neighborBlockAt, nx, ny, nz)) continue;

          const slot = textureSlotFor(id, fi);
          const box = uvBoxForSlot(slot);
          const uvCorners = FACE_UV_CORNERS[fi];
          const base = positions.length / 3;
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.corners[ci];
            const ao = computeAo(blocks, neighborBlockAt, nx, ny, nz, corner.ao);
            const b = AO_BRIGHTNESS[ao];
            const gray = Math.floor(b * 255);
            positions.push(x + corner.pos[0], y + corner.pos[1], z + corner.pos[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            colors.push(gray, gray, gray);
            const [cu, cv] = uvCorners[ci];
            const u = box.u0 + cu * (box.u1 - box.u0);
            const v = box.v0 + cv * (box.v1 - box.v0);
            uvs.push(u, v);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Uint8Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

export function meshChunkWater(
  blocks: Uint8Array,
  neighborBlockAt?: NeighborBlockAt,
): ChunkMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < CHUNK_SIZE_Y; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = blocks[idx(x, y, z)] as BlockId;
        if (!isWaterBlock(id)) continue;

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = x + face.dx;
          const ny = y + face.dy;
          const nz = z + face.dz;
          // 水面: 隣が AIR のときだけ描く（水-水、水-opaque は描かない）
          if (!isAirAt(blocks, neighborBlockAt, nx, ny, nz)) continue;

          const slot = textureSlotFor(id, fi);
          const box = uvBoxForSlot(slot);
          const uvCorners = FACE_UV_CORNERS[fi];
          const base = positions.length / 3;
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.corners[ci];
            positions.push(
              x + corner.pos[0],
              y + corner.pos[1],
              z + corner.pos[2],
            );
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            // 水は AO なし、テクスチャ色をそのまま透過させるため白
            colors.push(255, 255, 255);
            const [cu, cv] = uvCorners[ci];
            const u = box.u0 + cu * (box.u1 - box.u0);
            const v = box.v0 + cv * (box.v1 - box.v0);
            uvs.push(u, v);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Uint8Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}
