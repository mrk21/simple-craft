import { test, expect } from 'vitest';
import { BLOCK, blockKind, blockFaces, blockColor } from './block';

test('BLOCK.AIR は 0（Uint8Array ゼロ初期化が空気になるため）', () => {
  expect(BLOCK.AIR).toBe(0);
});

test('全ブロックの ID はユニーク', () => {
  const ids = Object.values(BLOCK);
  expect(new Set(ids).size).toBe(ids.length);
});

test('AIR の kind は air', () => {
  expect(blockKind(BLOCK.AIR)).toBe('air');
});

test('STONE の kind は opaque', () => {
  expect(blockKind(BLOCK.STONE)).toBe('opaque');
});

test('GRASS の kind は opaque', () => {
  expect(blockKind(BLOCK.GRASS)).toBe('opaque');
});

test('SAND の kind は opaque', () => {
  expect(blockKind(BLOCK.SAND)).toBe('opaque');
});

test('WATER の kind は transparent', () => {
  expect(blockKind(BLOCK.WATER)).toBe('transparent');
});

test('GRASS の面構成は top-bottom-side', () => {
  expect(blockFaces(BLOCK.GRASS)).toBe('top-bottom-side');
});

test('STONE の面構成は uniform', () => {
  expect(blockFaces(BLOCK.STONE)).toBe('uniform');
});

test('SAND の面構成は uniform', () => {
  expect(blockFaces(BLOCK.SAND)).toBe('uniform');
});

test('WATER の面構成は uniform', () => {
  expect(blockFaces(BLOCK.WATER)).toBe('uniform');
});

test('GRASS の色は緑系（G が R, B より大きい）', () => {
  const [r, g, b] = blockColor(BLOCK.GRASS);
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
});

test('STONE の色は灰色（R=G=B）', () => {
  const [r, g, b] = blockColor(BLOCK.STONE);
  expect(r).toBe(g);
  expect(g).toBe(b);
});

test('SAND の色はタン系（R > B、G が中間）', () => {
  const [r, g, b] = blockColor(BLOCK.SAND);
  expect(r).toBeGreaterThan(b);
  expect(g).toBeGreaterThan(b);
  expect(g).toBeLessThanOrEqual(r);
});

test('WATER の色は青系（B が R, G より大きい）', () => {
  const [r, g, b] = blockColor(BLOCK.WATER);
  expect(b).toBeGreaterThan(r);
  expect(b).toBeGreaterThan(g);
});
