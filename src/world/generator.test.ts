import { test, expect } from 'vitest';
import { generateBlocks, generateHeightmap, SEA_LEVEL } from './generator';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
  idx,
} from './chunk';
import { BLOCK } from './block';

test('heightmap は Uint8Array で長さは CHUNK_SIZE_X * CHUNK_SIZE_Z', () => {
  const h = generateHeightmap(0, 0, 12345);
  expect(h).toBeInstanceOf(Uint8Array);
  expect(h.length).toBe(CHUNK_SIZE_X * CHUNK_SIZE_Z);
});

test('同じシード+座標で同じ heightmap が出る', () => {
  expect(generateHeightmap(0, 0, 12345)).toEqual(generateHeightmap(0, 0, 12345));
});

test('異なるシードで異なる heightmap が出る', () => {
  expect(generateHeightmap(0, 0, 12345)).not.toEqual(
    generateHeightmap(0, 0, 67890),
  );
});

test('異なるチャンク座標で異なる heightmap が出る', () => {
  expect(generateHeightmap(0, 0, 12345)).not.toEqual(
    generateHeightmap(1, 0, 12345),
  );
});

test('全ての高さが [0, CHUNK_SIZE_Y) に収まる', () => {
  for (const seed of [12345, 67890, 1, 999999]) {
    for (let cz = -2; cz <= 2; cz++) {
      for (let cx = -2; cx <= 2; cx++) {
        const h = generateHeightmap(cx, cz, seed);
        for (let i = 0; i < h.length; i++) {
          expect(h[i]).toBeGreaterThanOrEqual(0);
          expect(h[i]).toBeLessThan(CHUNK_SIZE_Y);
        }
      }
    }
  }
});

test('チャンク境界で高さが連続している（X方向、隣接セル差≤4）', () => {
  // 多オクターブ + 山岳ノイズで斜面は急になるが、ノイズ自体は連続なので
  // 境界での隣接セル差は数ブロックに収まる
  const left = generateHeightmap(0, 0, 12345);
  const right = generateHeightmap(1, 0, 12345);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    const leftEdge = left[CHUNK_SIZE_X - 1 + z * CHUNK_SIZE_X];
    const rightEdge = right[0 + z * CHUNK_SIZE_X];
    expect(Math.abs(leftEdge - rightEdge)).toBeLessThanOrEqual(4);
  }
});

test('チャンク境界で高さが連続している（Z方向、隣接セル差≤4）', () => {
  const near = generateHeightmap(0, 0, 12345);
  const far = generateHeightmap(0, 1, 12345);
  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    const nearEdge = near[x + (CHUNK_SIZE_Z - 1) * CHUNK_SIZE_X];
    const farEdge = far[x + 0 * CHUNK_SIZE_X];
    expect(Math.abs(nearEdge - farEdge)).toBeLessThanOrEqual(4);
  }
});

test('複数チャンク全体で見て陸地（>SEA_LEVEL+8）と海底（<SEA_LEVEL-5）の両方が現れる', () => {
  // 大陸度ノイズで「内陸（丘）」と「深い海」が混在することの確認
  let maxH = 0;
  let minH = 255;
  const seed = 12345;
  for (let cz = -4; cz <= 4; cz++) {
    for (let cx = -4; cx <= 4; cx++) {
      const h = generateHeightmap(cx, cz, seed);
      for (let i = 0; i < h.length; i++) {
        if (h[i] > maxH) maxH = h[i];
        if (h[i] < minH) minH = h[i];
      }
    }
  }
  expect(maxH).toBeGreaterThan(SEA_LEVEL + 8);
  expect(minH).toBeLessThan(SEA_LEVEL - 5);
});

test('blocks は Uint8Array で長さは CHUNK_VOLUME', () => {
  const h = generateHeightmap(0, 0, 12345);
  const blocks = generateBlocks(h);
  expect(blocks).toBeInstanceOf(Uint8Array);
  expect(blocks.length).toBe(CHUNK_VOLUME);
});

test('海面より高い列の表面ブロックは GRASS', () => {
  const heightmap = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  heightmap.fill(SEA_LEVEL + 5);
  const blocks = generateBlocks(heightmap);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      expect(blocks[idx(x, SEA_LEVEL + 5, z)]).toBe(BLOCK.GRASS);
    }
  }
});

test('海面以下の列の表面ブロックは SAND', () => {
  const heightmap = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  heightmap.fill(SEA_LEVEL - 5);
  const blocks = generateBlocks(heightmap);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      expect(blocks[idx(x, SEA_LEVEL - 5, z)]).toBe(BLOCK.SAND);
    }
  }
});

test('表面より下のブロックは STONE', () => {
  const heightmap = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  heightmap.fill(SEA_LEVEL + 5);
  const blocks = generateBlocks(heightmap);
  for (let y = 0; y < SEA_LEVEL + 5; y++) {
    expect(blocks[idx(0, y, 0)]).toBe(BLOCK.STONE);
  }
});

test('表面より上で海面以下のセルは WATER', () => {
  const heightmap = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  heightmap.fill(SEA_LEVEL - 5);
  const blocks = generateBlocks(heightmap);
  for (let y = SEA_LEVEL - 4; y <= SEA_LEVEL; y++) {
    expect(blocks[idx(0, y, 0)]).toBe(BLOCK.WATER);
  }
});

test('海面より上のセルは AIR (0)', () => {
  const heightmap = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  heightmap.fill(SEA_LEVEL - 5);
  const blocks = generateBlocks(heightmap);
  for (let y = SEA_LEVEL + 1; y < CHUNK_SIZE_Y; y++) {
    expect(blocks[idx(0, y, 0)]).toBe(BLOCK.AIR);
  }
});
