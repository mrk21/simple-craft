import { test, expect } from 'vitest';
import { BLOCK, type BlockId } from '../world/block';
import {
  computeWaterState,
  createWaterFlowState,
  markPendingWithNeighbors,
  type BlockAtFn,
} from './water-flow';

// シンプルな blockAt: 座標 → ブロック の Map ベース
function makeBlockAt(blocks: Record<string, BlockId>): BlockAtFn {
  return (wx, wy, wz) => blocks[`${wx},${wy},${wz}`] ?? BLOCK.AIR;
}

test('SOURCE は常に SOURCE のまま', () => {
  const blockAt = makeBlockAt({});
  expect(computeWaterState(0, 0, 0, BLOCK.WATER, blockAt)).toBe(BLOCK.WATER);
});

test('opaque ブロックは触らない', () => {
  const blockAt = makeBlockAt({});
  expect(computeWaterState(0, 0, 0, BLOCK.STONE, blockAt)).toBe(BLOCK.STONE);
});

test('上に水があると F1 (落下水)', () => {
  const blockAt = makeBlockAt({ '0,1,0': BLOCK.WATER });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.WATER_F1);
});

test('床に支えられた SOURCE が横にあると F1 に広がる', () => {
  // (1, 0, 0) に SOURCE、その直下 (1, -1, 0) は STONE（床）
  const blockAt = makeBlockAt({
    '1,0,0': BLOCK.WATER,
    '1,-1,0': BLOCK.STONE,
  });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.WATER_F1);
});

test('床のない（直下が空気）SOURCE は横に広がらない', () => {
  // 直下が AIR なので「空中の水」扱い、広がらない
  const blockAt = makeBlockAt({
    '1,0,0': BLOCK.WATER,
    // '1,-1,0' は AIR（デフォルト）
  });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.AIR);
});

test('床のない FLOWING（滝の途中）は横に広がらない', () => {
  const blockAt = makeBlockAt({
    '1,0,0': BLOCK.WATER_F1,
    // '1,-1,0' は AIR
  });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.AIR);
});

test('床付き F1 → F2 に広がる', () => {
  const blockAt = makeBlockAt({
    '1,0,0': BLOCK.WATER_F1,
    '1,-1,0': BLOCK.STONE,
  });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.WATER_F2);
});

test('床付き F3 → MAX 超なので AIR (干上がる)', () => {
  const blockAt = makeBlockAt({
    '1,0,0': BLOCK.WATER_F3,
    '1,-1,0': BLOCK.STONE,
  });
  expect(computeWaterState(0, 0, 0, BLOCK.AIR, blockAt)).toBe(BLOCK.AIR);
});

test('FLOWING も上に水あれば F1 (滝の途中継続)', () => {
  const blockAt = makeBlockAt({ '0,1,0': BLOCK.WATER_F1 });
  expect(computeWaterState(0, 0, 0, BLOCK.WATER_F2, blockAt)).toBe(
    BLOCK.WATER_F1,
  );
});

test('markPendingWithNeighbors: 7 セル追加（自分 + 6 隣接）', () => {
  const state = createWaterFlowState();
  markPendingWithNeighbors(state, 0, 0, 0);
  expect(state.pending.size).toBe(7);
  expect(state.pending.has('0,0,0')).toBe(true);
  expect(state.pending.has('1,0,0')).toBe(true);
  expect(state.pending.has('-1,0,0')).toBe(true);
  expect(state.pending.has('0,1,0')).toBe(true);
  expect(state.pending.has('0,-1,0')).toBe(true);
  expect(state.pending.has('0,0,1')).toBe(true);
  expect(state.pending.has('0,0,-1')).toBe(true);
});
