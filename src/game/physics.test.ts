import { test, expect } from 'vitest';
import { isInWater, moveAndCollide, type PlayerState } from './physics';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 0,
    y: 64,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    ...over,
  };
}

import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './physics';

test('障害物なしで X 方向に移動できる', () => {
  const player = makePlayer({ x: 8.5, vx: 1 });
  moveAndCollide(player, () => false, 1);
  expect(player.x).toBeCloseTo(9.5);
  expect(player.vx).toBe(1);
});

test('右方向に進むと壁ブロックの直前で停止して vx=0', () => {
  const player = makePlayer({ x: 9.4, vx: 1 });
  const wallSolid = (x: number, y: number, _z: number) =>
    x === 10 && y === 64;
  moveAndCollide(player, wallSolid, 1);
  expect(player.x + PLAYER_HALF_WIDTH).toBeCloseTo(10);
  expect(player.vx).toBe(0);
});

test('左方向に進むと壁ブロックの直前で停止して vx=0', () => {
  const player = makePlayer({ x: 10.6, vx: -1 });
  const wallSolid = (x: number, y: number, _z: number) =>
    x === 9 && y === 64;
  moveAndCollide(player, wallSolid, 1);
  expect(player.x - PLAYER_HALF_WIDTH).toBeCloseTo(10);
  expect(player.vx).toBe(0);
});

test('落下中に地面に着地すると y=床上、vy=0、onGround=true', () => {
  const player = makePlayer({ y: 64.5, vy: -1 });
  // 地面: y=63 のブロック（上面が y=64）
  const groundSolid = (_x: number, y: number, _z: number) => y === 63;
  moveAndCollide(player, groundSolid, 1);
  expect(player.y).toBeCloseTo(64);
  expect(player.vy).toBe(0);
  expect(player.onGround).toBe(true);
});

test('上昇中に天井にぶつかると vy=0、onGround=false', () => {
  // プレイヤー上端 = y + HEIGHT(1.8)。 y=64.5 のとき上端 66.3。
  // 天井: y=67 のブロック → 上端を 67 まで押し下げる
  const player = makePlayer({ y: 65.4, vy: 1 });
  const ceilingSolid = (_x: number, y: number, _z: number) => y === 67;
  moveAndCollide(player, ceilingSolid, 1);
  expect(player.y + PLAYER_HEIGHT).toBeCloseTo(67);
  expect(player.vy).toBe(0);
  expect(player.onGround).toBe(false);
});

test('障害物なし落下中は vy が moveAndCollide で変わらない（重力は外で適用）', () => {
  const player = makePlayer({ y: 100, vy: -5 });
  moveAndCollide(player, () => false, 0.5);
  expect(player.y).toBeCloseTo(97.5);
  expect(player.vy).toBe(-5);
  expect(player.onGround).toBe(false);
});

test('isInWater: 水ブロックがない時は false', () => {
  const player = makePlayer({ x: 0.5, y: 64, z: 0.5 });
  expect(isInWater(player, () => false)).toBe(false);
});

test('isInWater: 水ブロックがプレイヤー AABB と重なる時は true', () => {
  // プレイヤー y=64 → AABB Y=[64, 65.8]、足元 y=64 を水にする
  const player = makePlayer({ x: 0.5, y: 64, z: 0.5 });
  const isWater = (_x: number, y: number, _z: number) => y === 64;
  expect(isInWater(player, isWater)).toBe(true);
});

test('isInWater: 水の上に立っている場合は false（AABB は水と重ならない）', () => {
  // プレイヤー y=64、水は y=63（プレイヤー AABB の minY=64 より下）
  const player = makePlayer({ x: 0.5, y: 64, z: 0.5 });
  const isWater = (_x: number, y: number, _z: number) => y === 63;
  expect(isInWater(player, isWater)).toBe(false);
});
