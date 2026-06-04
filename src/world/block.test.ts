import { test, expect } from 'vitest';
import {
  BLOCK,
  MAX_FLOWING_LEVEL,
  blockKind,
  blockFaces,
  blockColor,
  flowingWaterForLevel,
  isWaterBlock,
  waterLevel,
} from './block';

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

test('isWaterBlock: WATER と全 FLOWING は true', () => {
  expect(isWaterBlock(BLOCK.WATER)).toBe(true);
  expect(isWaterBlock(BLOCK.WATER_F1)).toBe(true);
  expect(isWaterBlock(BLOCK.WATER_F2)).toBe(true);
  expect(isWaterBlock(BLOCK.WATER_F3)).toBe(true);
});

test('isWaterBlock: 非水ブロックは false', () => {
  expect(isWaterBlock(BLOCK.AIR)).toBe(false);
  expect(isWaterBlock(BLOCK.STONE)).toBe(false);
  expect(isWaterBlock(BLOCK.GRASS)).toBe(false);
  expect(isWaterBlock(BLOCK.SAND)).toBe(false);
});

test('waterLevel: SOURCE は 0', () => {
  expect(waterLevel(BLOCK.WATER)).toBe(0);
});

test('waterLevel: FLOWING_N は N', () => {
  expect(waterLevel(BLOCK.WATER_F1)).toBe(1);
  expect(waterLevel(BLOCK.WATER_F2)).toBe(2);
  expect(waterLevel(BLOCK.WATER_F3)).toBe(3);
});

test('waterLevel: 非水は -1', () => {
  expect(waterLevel(BLOCK.AIR)).toBe(-1);
  expect(waterLevel(BLOCK.STONE)).toBe(-1);
});

test('flowingWaterForLevel: 1-3 → WATER_F1-3', () => {
  expect(flowingWaterForLevel(1)).toBe(BLOCK.WATER_F1);
  expect(flowingWaterForLevel(2)).toBe(BLOCK.WATER_F2);
  expect(flowingWaterForLevel(3)).toBe(BLOCK.WATER_F3);
});

test('MAX_FLOWING_LEVEL は 3', () => {
  expect(MAX_FLOWING_LEVEL).toBe(3);
});

test('全 FLOWING の kind は transparent', () => {
  expect(blockKind(BLOCK.WATER_F1)).toBe('transparent');
  expect(blockKind(BLOCK.WATER_F2)).toBe('transparent');
  expect(blockKind(BLOCK.WATER_F3)).toBe('transparent');
});
