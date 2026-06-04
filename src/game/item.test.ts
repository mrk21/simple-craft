import { test, expect } from 'vitest';
import { BLOCK } from '../world/block';
import {
  HOTBAR_SLOTS,
  MAX_STACK,
  TOTAL_SLOTS,
  addItemToInventory,
  consumeSelected,
  createInventoryState,
  isExpired,
  isInPickupRange,
  returnHeldToInventory,
  swapOrMergeSlot,
  type DroppedItem,
} from './item';

test('createInventoryState: スロット 0..3 に初期スタックが置かれている', () => {
  const inv = createInventoryState();
  expect(inv.slots[0]?.block).toBe(BLOCK.GRASS);
  expect(inv.slots[1]?.block).toBe(BLOCK.STONE);
  expect(inv.slots[2]?.block).toBe(BLOCK.SAND);
  expect(inv.slots[3]?.block).toBe(BLOCK.WATER);
  expect(inv.slots[4]).toBeNull();
  expect(inv.selectedHotbarIndex).toBe(0);
  expect(inv.heldItem).toBeNull();
});

test('addItemToInventory: 同じブロックの既存スタックに合流して count+1', () => {
  const inv = createInventoryState();
  inv.slots[0] = { block: BLOCK.STONE, count: 10 };
  const ok = addItemToInventory(inv, BLOCK.STONE);
  expect(ok).toBe(true);
  expect(inv.slots[0]?.count).toBe(11);
});

test('addItemToInventory: 既存スタックが満杯なら新規スタック', () => {
  const inv = createInventoryState();
  for (let i = 0; i < TOTAL_SLOTS; i++) inv.slots[i] = null;
  inv.slots[0] = { block: BLOCK.STONE, count: MAX_STACK };
  const ok = addItemToInventory(inv, BLOCK.STONE);
  expect(ok).toBe(true);
  const slot1 = inv.slots[1];
  expect(inv.slots[0]?.count).toBe(MAX_STACK); // 既存は満杯のまま
  expect(slot1?.block).toBe(BLOCK.STONE);
  expect(slot1?.count).toBe(1);
});

test('addItemToInventory: 全スロット満杯なら false', () => {
  const inv = createInventoryState();
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    inv.slots[i] = { block: BLOCK.STONE, count: MAX_STACK };
  }
  const ok = addItemToInventory(inv, BLOCK.GRASS);
  expect(ok).toBe(false);
});

test('swapOrMergeSlot: 空持ち物で slot のアイテムを取得', () => {
  const inv = createInventoryState();
  inv.slots[5] = { block: BLOCK.GRASS, count: 3 };
  swapOrMergeSlot(inv, 5);
  const held = inv.heldItem;
  expect(held?.block).toBe(BLOCK.GRASS);
  expect(held?.count).toBe(3);
  expect(inv.slots[5]).toBeNull();
});

test('swapOrMergeSlot: 同種スタックに合流（収まる）', () => {
  const inv = createInventoryState();
  inv.heldItem = { block: BLOCK.STONE, count: 5 };
  inv.slots[5] = { block: BLOCK.STONE, count: 10 };
  swapOrMergeSlot(inv, 5);
  expect(inv.slots[5]?.count).toBe(15);
  expect(inv.heldItem).toBeNull();
});

test('swapOrMergeSlot: 同種スタックに合流（収まらず残る）', () => {
  const inv = createInventoryState();
  inv.heldItem = { block: BLOCK.STONE, count: 20 };
  inv.slots[5] = { block: BLOCK.STONE, count: 60 };
  swapOrMergeSlot(inv, 5);
  expect(inv.slots[5]?.count).toBe(MAX_STACK);
  expect(inv.heldItem?.count).toBe(20 - (MAX_STACK - 60));
});

test('swapOrMergeSlot: 異種ブロックはスワップ', () => {
  const inv = createInventoryState();
  inv.heldItem = { block: BLOCK.STONE, count: 5 };
  inv.slots[5] = { block: BLOCK.GRASS, count: 10 };
  swapOrMergeSlot(inv, 5);
  expect(inv.slots[5]?.block).toBe(BLOCK.STONE);
  expect(inv.slots[5]?.count).toBe(5);
  expect(inv.heldItem?.block).toBe(BLOCK.GRASS);
  expect(inv.heldItem?.count).toBe(10);
});

test('consumeSelected: 選択スロットを 1 消費して block を返す', () => {
  const inv = createInventoryState();
  inv.selectedHotbarIndex = 1;
  inv.slots[1] = { block: BLOCK.STONE, count: 5 };
  const block = consumeSelected(inv);
  expect(block).toBe(BLOCK.STONE);
  expect(inv.slots[1]?.count).toBe(4);
});

test('consumeSelected: 最後の1個を消費するとスロットが空になる', () => {
  const inv = createInventoryState();
  inv.selectedHotbarIndex = 1;
  inv.slots[1] = { block: BLOCK.STONE, count: 1 };
  const block = consumeSelected(inv);
  expect(block).toBe(BLOCK.STONE);
  expect(inv.slots[1]).toBeNull();
});

test('consumeSelected: 空スロット選択時は null', () => {
  const inv = createInventoryState();
  inv.selectedHotbarIndex = 5; // 初期で空
  expect(consumeSelected(inv)).toBeNull();
});

test('returnHeldToInventory: 同種スタックに合流可能なら合流', () => {
  const inv = createInventoryState();
  inv.heldItem = { block: BLOCK.STONE, count: 5 };
  inv.slots[1] = { block: BLOCK.STONE, count: 10 };
  returnHeldToInventory(inv);
  expect(inv.slots[1]?.count).toBe(15);
  expect(inv.heldItem).toBeNull();
});

test('returnHeldToInventory: 合流先がなければ空スロットへ', () => {
  const inv = createInventoryState();
  inv.heldItem = { block: BLOCK.GRASS, count: 3 };
  inv.slots[0] = { block: BLOCK.STONE, count: MAX_STACK };
  for (let i = 1; i < TOTAL_SLOTS; i++) inv.slots[i] = null;
  returnHeldToInventory(inv);
  expect(inv.slots[1]?.block).toBe(BLOCK.GRASS);
  expect(inv.slots[1]?.count).toBe(3);
  expect(inv.heldItem).toBeNull();
});

test('isInPickupRange: 範囲内 → true', () => {
  const item: DroppedItem = makeItem({ x: 0, y: 0, z: 0 });
  expect(isInPickupRange(item, 0.5, 0, 0)).toBe(true);
});

test('isInPickupRange: 範囲外 → false', () => {
  const item: DroppedItem = makeItem({ x: 0, y: 0, z: 0 });
  expect(isInPickupRange(item, 5, 0, 0)).toBe(false);
});

test('isExpired: 寿命未満は false、超えたら true', () => {
  const item: DroppedItem = makeItem({ age: 0 });
  expect(isExpired(item)).toBe(false);
  item.age = 999;
  expect(isExpired(item)).toBe(true);
});

// テストヘルパー: mesh は使わないので any でモック
function makeItem(over: Partial<DroppedItem>): DroppedItem {
  return {
    block: BLOCK.STONE,
    mesh: null as unknown as DroppedItem['mesh'],
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 0,
    ...over,
  };
}

// HOTBAR_SLOTS が使われているか sanity
test('HOTBAR_SLOTS + 27 = TOTAL_SLOTS', () => {
  expect(HOTBAR_SLOTS + 27).toBe(TOTAL_SLOTS);
});
