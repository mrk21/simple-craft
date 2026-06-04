import { test, expect } from 'vitest';
import { meshChunk, meshChunkWater } from './mesher';
import { CHUNK_SIZE_X, CHUNK_VOLUME, idx } from '../world/chunk';
import { BLOCK } from '../world/block';
import { TEX, uvBoxForSlot } from './atlas';

test('全 AIR のチャンクは空メッシュ', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  const mesh = meshChunk(blocks);
  expect(mesh.positions.length).toBe(0);
  expect(mesh.normals.length).toBe(0);
  expect(mesh.colors.length).toBe(0);
  expect(mesh.uvs.length).toBe(0);
  expect(mesh.indices.length).toBe(0);
});

test('中央に STONE 1個 → 6面（24頂点・36インデックス）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  expect(mesh.indices.length).toBe(36); // 6面 × 2三角形 × 3頂点
  expect(mesh.positions.length).toBe(24 * 3); // 6面 × 4頂点 × 3座標
  expect(mesh.normals.length).toBe(24 * 3);
  expect(mesh.colors.length).toBe(24 * 3); // 6面 × 4頂点 × RGB3
  expect(mesh.uvs.length).toBe(24 * 2); // 6面 × 4頂点 × UV2
});

test('AO 占有なしのブロックの頂点カラーは全て白(255)のグレースケール', () => {
  // 単独ブロックは AO 占有なし → 明度 1.0 → 全成分 255
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  for (let v = 0; v < mesh.colors.length / 3; v++) {
    expect(mesh.colors[v * 3]).toBe(255);
    expect(mesh.colors[v * 3 + 1]).toBe(255);
    expect(mesh.colors[v * 3 + 2]).toBe(255);
  }
});

test('頂点カラーはグレースケール（R=G=B、AO のみを表す）', () => {
  // AO 影響を入れるため隣接ブロックを置く
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.GRASS;
  blocks[idx(9, 64, 9)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  for (let v = 0; v < mesh.colors.length / 3; v++) {
    expect(mesh.colors[v * 3]).toBe(mesh.colors[v * 3 + 1]);
    expect(mesh.colors[v * 3 + 1]).toBe(mesh.colors[v * 3 + 2]);
  }
});

test('隣接する STONE 2個 → 10面（接面2つカリング）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  blocks[idx(9, 64, 8)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  expect(mesh.indices.length).toBe(10 * 6); // 10面 × 6インデックス
});

test('チャンク隅の STONE → 6面（境界外は AIR 扱い）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(0, 0, 0)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  expect(mesh.indices.length).toBe(36);
});

test('全ての面の頂点順序（CCW winding）が法線と一致する', () => {
  // (v1-v0) × (v2-v0) が法線と同方向（dot > 0）であれば、その三角形は外向き
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  const faceCount = mesh.indices.length / 6;
  for (let f = 0; f < faceCount; f++) {
    const offset = f * 4 * 3;
    const v0 = mesh.positions.subarray(offset, offset + 3);
    const v1 = mesh.positions.subarray(offset + 3, offset + 6);
    const v2 = mesh.positions.subarray(offset + 6, offset + 9);
    const n = mesh.normals.subarray(offset, offset + 3);
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const cross = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const dot = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
    expect(dot, `面 ${f}: normal=(${n[0]},${n[1]},${n[2]})`).toBeGreaterThan(0);
  }
});

test('隣接 opaque ブロックによる AO で一部頂点が暗くなる', () => {
  // 単独 STONE: AO 占有なし → 全頂点フル明度
  const noOccluder = new Uint8Array(CHUNK_VOLUME);
  noOccluder[idx(8, 64, 8)] = BLOCK.STONE;
  const meshNo = meshChunk(noOccluder);

  // 対角に STONE を追加: 共有面なしだが AO に影響する
  const withOccluder = new Uint8Array(CHUNK_VOLUME);
  withOccluder[idx(8, 64, 8)] = BLOCK.STONE;
  withOccluder[idx(9, 64, 9)] = BLOCK.STONE;
  const meshWith = meshChunk(withOccluder);

  // (8,64,8) の頂点数は同じ（共有面なし）
  // 6面 × 4頂点 × 3RGB = 72 が両方の最初のブロック分
  const firstBlockColors = 72;

  let darkenedCount = 0;
  for (let i = 0; i < firstBlockColors; i++) {
    if (meshWith.colors[i] < meshNo.colors[i]) darkenedCount++;
  }
  expect(darkenedCount).toBeGreaterThan(0);
});

test('meshChunkWater: opaque のみ → 空メッシュ', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  const water = meshChunkWater(blocks);
  expect(water.indices.length).toBe(0);
  expect(water.uvs.length).toBe(0);
});

test('meshChunkWater: 単独 WATER → 6面', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.WATER;
  const water = meshChunkWater(blocks);
  expect(water.indices.length).toBe(36);
  expect(water.uvs.length).toBe(24 * 2);
});

test('meshChunkWater: WATER の隣が STONE → 接面は描かない（5面）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.WATER;
  blocks[idx(9, 64, 8)] = BLOCK.STONE;
  const water = meshChunkWater(blocks);
  expect(water.indices.length).toBe(5 * 6);
});

test('meshChunkWater: 隣接 WATER 2個 → 接面カリング（10面）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.WATER;
  blocks[idx(9, 64, 8)] = BLOCK.WATER;
  const water = meshChunkWater(blocks);
  expect(water.indices.length).toBe(10 * 6);
});

test('meshChunk: 隣接チャンクの opaque で境界面はカリングされる', () => {
  // チャンク端 X=15 に STONE を置き、+X 方向の隣接チャンクにも STONE
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(CHUNK_SIZE_X - 1, 64, 8)] = BLOCK.STONE;

  const mesh = meshChunk(blocks, (x, _y, _z) => {
    if (x === CHUNK_SIZE_X) return BLOCK.STONE;
    return BLOCK.AIR;
  });
  expect(mesh.indices.length).toBe(5 * 6); // +X 面がカリング → 5 面
});

test('meshChunkWater: 隣接チャンクの WATER で水-水接面はカリング', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(CHUNK_SIZE_X - 1, 64, 8)] = BLOCK.WATER;

  const mesh = meshChunkWater(blocks, (x, _y, _z) => {
    if (x === CHUNK_SIZE_X) return BLOCK.WATER;
    return BLOCK.AIR;
  });
  expect(mesh.indices.length).toBe(5 * 6);
});

test('meshChunkWater: 全頂点カラーは白（テクスチャをそのまま透過）', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.WATER;
  const water = meshChunkWater(blocks);
  for (let v = 0; v < water.colors.length / 3; v++) {
    expect(water.colors[v * 3]).toBe(255);
    expect(water.colors[v * 3 + 1]).toBe(255);
    expect(water.colors[v * 3 + 2]).toBe(255);
  }
});

test('STONE の隣が WATER → STONE 側の面は描かれる（透明扱い）', () => {
  const stoneAdjacentToWater = new Uint8Array(CHUNK_VOLUME);
  stoneAdjacentToWater[idx(8, 64, 8)] = BLOCK.STONE;
  stoneAdjacentToWater[idx(9, 64, 8)] = BLOCK.WATER;
  const meshA = meshChunk(stoneAdjacentToWater);

  const stoneAdjacentToStone = new Uint8Array(CHUNK_VOLUME);
  stoneAdjacentToStone[idx(8, 64, 8)] = BLOCK.STONE;
  stoneAdjacentToStone[idx(9, 64, 8)] = BLOCK.STONE;
  const meshB = meshChunk(stoneAdjacentToStone);

  // WATER 隣接: STONE は単独と同じ6面（WATER 自体は opaque パスに含まれない）
  expect(meshA.indices.length).toBe(36);
  // STONE 隣接: 接面が両側でカリングされ 10面
  expect(meshB.indices.length).toBe(60);
});

test('STONE の全頂点 UV は STONE スロットの矩形内に収まる', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.STONE;
  const mesh = meshChunk(blocks);
  const box = uvBoxForSlot(TEX.STONE);
  for (let v = 0; v < mesh.uvs.length / 2; v++) {
    const u = mesh.uvs[v * 2];
    const vy = mesh.uvs[v * 2 + 1];
    expect(u).toBeGreaterThanOrEqual(box.u0 - 1e-6);
    expect(u).toBeLessThanOrEqual(box.u1 + 1e-6);
    expect(vy).toBeGreaterThanOrEqual(box.v0 - 1e-6);
    expect(vy).toBeLessThanOrEqual(box.v1 + 1e-6);
  }
});

test('GRASS: 上面=GRASS_TOP, 下面=DIRT, 側面=GRASS_SIDE スロットの UV を持つ', () => {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.GRASS;
  const mesh = meshChunk(blocks);

  // 面の順序は mesher の FACES と一致: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
  const topBox = uvBoxForSlot(TEX.GRASS_TOP);
  const dirtBox = uvBoxForSlot(TEX.DIRT);
  const sideBox = uvBoxForSlot(TEX.GRASS_SIDE);

  const faceCount = mesh.indices.length / 6;
  expect(faceCount).toBe(6);

  function uvAt(faceIdx: number, cornerIdx: number): [number, number] {
    const i = (faceIdx * 4 + cornerIdx) * 2;
    return [mesh.uvs[i], mesh.uvs[i + 1]];
  }

  function inBox(uv: [number, number], box: { u0: number; v0: number; u1: number; v1: number }) {
    return (
      uv[0] >= box.u0 - 1e-6 && uv[0] <= box.u1 + 1e-6 &&
      uv[1] >= box.v0 - 1e-6 && uv[1] <= box.v1 + 1e-6
    );
  }

  for (let c = 0; c < 4; c++) {
    expect(inBox(uvAt(2, c), topBox), `top face corner ${c}`).toBe(true);
    expect(inBox(uvAt(3, c), dirtBox), `bottom face corner ${c}`).toBe(true);
  }
  for (const f of [0, 1, 4, 5]) {
    for (let c = 0; c < 4; c++) {
      expect(inBox(uvAt(f, c), sideBox), `side face ${f} corner ${c}`).toBe(true);
    }
  }
});

test('側面の UV: y=低 の頂点は v=下端、y=高 の頂点は v=上端', () => {
  // GRASS_SIDE のテクスチャは「上に草・下に土」で上下方向に意味がある
  const blocks = new Uint8Array(CHUNK_VOLUME);
  blocks[idx(8, 64, 8)] = BLOCK.GRASS;
  const mesh = meshChunk(blocks);
  const sideBox = uvBoxForSlot(TEX.GRASS_SIDE);

  // 各側面（face 0,1,4,5）について頂点の y 座標と v を対応付ける
  const sideFaces = [0, 1, 4, 5];
  for (const f of sideFaces) {
    for (let c = 0; c < 4; c++) {
      const posIdx = (f * 4 + c) * 3;
      const py = mesh.positions[posIdx + 1];
      const uvIdx = (f * 4 + c) * 2;
      const v = mesh.uvs[uvIdx + 1];

      // ブロック中心 (8,64,8) → y=64 が下端、y=65 が上端
      if (py === 64) {
        expect(v, `face ${f} corner ${c} bottom should have v=v1`).toBeCloseTo(sideBox.v1);
      } else if (py === 65) {
        expect(v, `face ${f} corner ${c} top should have v=v0`).toBeCloseTo(sideBox.v0);
      }
    }
  }
});
