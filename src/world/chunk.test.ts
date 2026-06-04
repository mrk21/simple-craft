import { test, expect } from 'vitest';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
  idx,
  worldToChunkLocal,
} from './chunk';

test('原点 (0, 0, 0) のインデックスは 0', () => {
  expect(idx(0, 0, 0)).toBe(0);
});

test('X が1増えるとインデックスが1増える', () => {
  expect(idx(1, 0, 0)).toBe(1);
});

test('Z が1増えるとインデックスが16増える', () => {
  expect(idx(0, 0, 1)).toBe(16);
});

test('Y が1増えるとインデックスが256増える', () => {
  expect(idx(0, 1, 0)).toBe(256);
});

test('最大座標のインデックスは CHUNK_VOLUME - 1', () => {
  expect(idx(CHUNK_SIZE_X - 1, CHUNK_SIZE_Y - 1, CHUNK_SIZE_Z - 1)).toBe(
    CHUNK_VOLUME - 1,
  );
});

test('worldToChunkLocal: 原点はチャンク(0,0)のローカル原点', () => {
  expect(worldToChunkLocal(0, 64, 0)).toEqual({ cx: 0, cz: 0, lx: 0, y: 64, lz: 0 });
});

test('worldToChunkLocal: チャンク(0,0)の端', () => {
  expect(worldToChunkLocal(15, 64, 15)).toEqual({
    cx: 0, cz: 0, lx: 15, y: 64, lz: 15,
  });
});

test('worldToChunkLocal: 隣のチャンク(+X)に跨ぐ', () => {
  expect(worldToChunkLocal(16, 64, 0)).toEqual({
    cx: 1, cz: 0, lx: 0, y: 64, lz: 0,
  });
});

test('worldToChunkLocal: 負の座標はチャンク(-1, ...)のローカルに正しくマッピング', () => {
  expect(worldToChunkLocal(-1, 64, 0)).toEqual({
    cx: -1, cz: 0, lx: 15, y: 64, lz: 0,
  });
});

test('worldToChunkLocal: 大きな負の座標', () => {
  expect(worldToChunkLocal(-17, 64, -17)).toEqual({
    cx: -2, cz: -2, lx: 15, y: 64, lz: 15,
  });
});

test('worldToChunkLocal: Y が範囲外なら null', () => {
  expect(worldToChunkLocal(0, -1, 0)).toBeNull();
  expect(worldToChunkLocal(0, CHUNK_SIZE_Y, 0)).toBeNull();
});
