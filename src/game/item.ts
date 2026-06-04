import * as THREE from 'three';
import { BLOCK, type BlockId, blockColor } from '../world/block';

// ============================================================
// インベントリ（ホットバー + 倉庫グリッド）
// ============================================================

export interface ItemStack {
  block: BlockId;
  count: number;
}

export const MAX_STACK = 64;
export const HOTBAR_SLOTS = 9;
export const INVENTORY_SLOTS = 27;
export const TOTAL_SLOTS = HOTBAR_SLOTS + INVENTORY_SLOTS;

export interface InventoryState {
  slots: (ItemStack | null)[];
  selectedHotbarIndex: number;
  heldItem: ItemStack | null;
}

export function createInventoryState(): InventoryState {
  const slots = new Array<ItemStack | null>(TOTAL_SLOTS).fill(null);
  slots[0] = { block: BLOCK.GRASS, count: MAX_STACK };
  slots[1] = { block: BLOCK.STONE, count: MAX_STACK };
  slots[2] = { block: BLOCK.SAND, count: MAX_STACK };
  slots[3] = { block: BLOCK.WATER, count: MAX_STACK };
  return {
    slots,
    selectedHotbarIndex: 0,
    heldItem: null,
  };
}

// 既存スタックに合流 or 新規スタック作成。失敗（満杯）なら false
export function addItemToInventory(
  state: InventoryState,
  block: BlockId,
): boolean {
  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i];
    if (slot && slot.block === block && slot.count < MAX_STACK) {
      slot.count += 1;
      return true;
    }
  }
  for (let i = 0; i < state.slots.length; i++) {
    if (state.slots[i] === null) {
      state.slots[i] = { block, count: 1 };
      return true;
    }
  }
  return false;
}

// インベントリのクリック操作: 空き持ち物なら取得、持ち物ありなら同種合流 or スワップ
export function swapOrMergeSlot(
  state: InventoryState,
  index: number,
): void {
  const slot = state.slots[index];
  if (state.heldItem === null) {
    if (slot !== null) {
      state.heldItem = slot;
      state.slots[index] = null;
    }
    return;
  }
  if (slot !== null && slot.block === state.heldItem.block) {
    const room = MAX_STACK - slot.count;
    const move = Math.min(room, state.heldItem.count);
    slot.count += move;
    state.heldItem.count -= move;
    if (state.heldItem.count === 0) state.heldItem = null;
    return;
  }
  state.slots[index] = state.heldItem;
  state.heldItem = slot;
}

// ホットバー選択中のスタックを 1 消費。0 になった場合スロットを空に
// 消費したブロックを返す（消費できない場合は null）
export function consumeSelected(state: InventoryState): BlockId | null {
  const slot = state.slots[state.selectedHotbarIndex];
  if (slot === null || slot.count === 0) return null;
  const block = slot.block;
  slot.count -= 1;
  if (slot.count === 0) state.slots[state.selectedHotbarIndex] = null;
  return block;
}

// 持ち物を抱えたままインベントリを閉じる時の戻し処理
// 既存スタックに合流可能ならそちらへ、不可なら空スロットへ
export function returnHeldToInventory(state: InventoryState): void {
  if (state.heldItem === null) return;
  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i];
    if (
      slot &&
      slot.block === state.heldItem.block &&
      slot.count + state.heldItem.count <= MAX_STACK
    ) {
      slot.count += state.heldItem.count;
      state.heldItem = null;
      return;
    }
  }
  for (let i = 0; i < state.slots.length; i++) {
    if (state.slots[i] === null) {
      state.slots[i] = state.heldItem;
      state.heldItem = null;
      return;
    }
  }
}

// ============================================================
// ドロップアイテム（破壊した時に出る小さな立方体）
// ============================================================

export interface DroppedItem {
  block: BlockId;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

export const ITEM_SIZE = 0.25;
export const ITEM_GRAVITY = -16;
export const ITEM_TERMINAL_VELOCITY = -20;
export const ITEM_POP_VY = 3;
export const ITEM_POP_HORIZ = 1.5;
export const ITEM_HORIZONTAL_FRICTION = 0.85;
export const ITEM_PICKUP_RADIUS = 1.5;
export const ITEM_LIFETIME = 300; // 5 分で自動消滅

export function spawnDroppedItem(
  block: BlockId,
  x: number,
  y: number,
  z: number,
  scene: THREE.Scene,
): DroppedItem {
  const [r, g, b] = blockColor(block);
  const color = (r << 16) | (g << 8) | b;
  const geo = new THREE.BoxGeometry(ITEM_SIZE, ITEM_SIZE, ITEM_SIZE);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const angle = Math.random() * Math.PI * 2;
  return {
    block,
    mesh,
    x,
    y,
    z,
    vx: Math.cos(angle) * ITEM_POP_HORIZ,
    vy: ITEM_POP_VY,
    vz: Math.sin(angle) * ITEM_POP_HORIZ,
    age: 0,
  };
}

export function disposeDroppedItem(
  item: DroppedItem,
  scene: THREE.Scene,
): void {
  scene.remove(item.mesh);
  item.mesh.geometry.dispose();
}

// 物理: 重力 + 水平摩擦 + 着地判定（純粋関数、テスト容易）
export function applyDroppedItemPhysics(
  item: DroppedItem,
  dt: number,
  isSolid: (x: number, y: number, z: number) => boolean,
): void {
  item.age += dt;
  item.vy += ITEM_GRAVITY * dt;
  if (item.vy < ITEM_TERMINAL_VELOCITY) item.vy = ITEM_TERMINAL_VELOCITY;
  const frictionFactor = Math.pow(ITEM_HORIZONTAL_FRICTION, dt * 60);
  item.vx *= frictionFactor;
  item.vz *= frictionFactor;
  item.x += item.vx * dt;
  item.y += item.vy * dt;
  item.z += item.vz * dt;
  const cellY = Math.floor(item.y);
  if (isSolid(Math.floor(item.x), cellY, Math.floor(item.z))) {
    item.y = cellY + 1;
    item.vy = 0;
  }
}

// 視覚演出（バウンス + Y軸回転）をメッシュに反映
export function syncDroppedItemMesh(item: DroppedItem): void {
  const bob = Math.sin(item.age * 2.5) * 0.06;
  item.mesh.position.set(item.x, item.y + bob, item.z);
  item.mesh.rotation.y = item.age * 1.8;
}

// プレイヤーの中心位置（py = 足元+高さ/2）と距離比較
export function isInPickupRange(
  item: DroppedItem,
  px: number,
  py: number,
  pz: number,
): boolean {
  const dx = px - item.x;
  const dy = py - item.y;
  const dz = pz - item.z;
  return dx * dx + dy * dy + dz * dz < ITEM_PICKUP_RADIUS * ITEM_PICKUP_RADIUS;
}

export function isExpired(item: DroppedItem): boolean {
  return item.age > ITEM_LIFETIME;
}
