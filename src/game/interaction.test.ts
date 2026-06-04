import { test, expect } from 'vitest';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './physics';
import { computeTargetCell, playerOverlapsBlock } from './interaction';

test('playerOverlapsBlock: 真上に乗っている時は重ならない（接触のみ）', () => {
  // プレイヤー y=64 (足元)、AABB Y=[64, 65.8]、ブロック y=63 (上面 64)
  // 接触するだけで重なりは strict 不成立
  expect(playerOverlapsBlock(0.5, 64, 0.5, 0, 63, 0)).toBe(false);
});

test('playerOverlapsBlock: 体内のブロックは重なり判定 true', () => {
  // プレイヤー y=64 → AABB [0.5±hw, 64..65.8]、ブロック (0, 64, 0) span [0..1]×[64..65]×[0..1]
  expect(playerOverlapsBlock(0.5, 64, 0.5, 0, 64, 0)).toBe(true);
});

test('playerOverlapsBlock: 横にブロック → AABB の HW を超えていれば false', () => {
  // プレイヤー (0, 64, 0)、ブロック (2, 64, 0) → 余裕で離れている
  expect(playerOverlapsBlock(0, 64, 0, 2, 64, 0)).toBe(false);
});

test('playerOverlapsBlock: PLAYER_HALF_WIDTH ぎりぎりの境界', () => {
  // プレイヤー右端 = px + hw、これがちょうど bx に触れる場合は重ならない
  const px = 1 - PLAYER_HALF_WIDTH;
  expect(playerOverlapsBlock(px, 64, 0.5, 1, 64, 0)).toBe(false);
  // 少しめり込んだら true
  expect(playerOverlapsBlock(px + 0.01, 64, 0.5, 1, 64, 0)).toBe(true);
});

test('playerOverlapsBlock: 頭上のブロック → AABB 上限と重なる', () => {
  // プレイヤー AABB Y 上限 = py + h、ブロック (0, py+h - 0.1, 0) は重なる
  const py = 64;
  const topBlockY = Math.floor(py + PLAYER_HEIGHT - 0.1);
  expect(playerOverlapsBlock(0.5, py, 0.5, 0, topBlockY, 0)).toBe(true);
});

test('computeTargetCell: 上面ヒット + place=true → 上のセル', () => {
  // ブロック (5, 10, 5) の上面でヒット、法線は (0, 1, 0)
  const c = computeTargetCell(5.3, 11.0, 5.7, 0, 1, 0, true);
  expect(c).toEqual({ x: 5, y: 11, z: 5 });
});

test('computeTargetCell: 上面ヒット + place=false → 自分のセル', () => {
  // 法線方向と逆に少しずらすので、ヒット面より下のセルが対象
  const c = computeTargetCell(5.3, 11.0, 5.7, 0, 1, 0, false);
  expect(c).toEqual({ x: 5, y: 10, z: 5 });
});

test('computeTargetCell: 横面ヒット + place=true → 法線方向のセル', () => {
  // ブロック (5, 10, 5) の +X 面、法線 (1, 0, 0)
  const c = computeTargetCell(6.0, 10.5, 5.3, 1, 0, 0, true);
  expect(c).toEqual({ x: 6, y: 10, z: 5 });
});

test('computeTargetCell: 横面ヒット + place=false → ヒットブロック', () => {
  const c = computeTargetCell(6.0, 10.5, 5.3, 1, 0, 0, false);
  expect(c).toEqual({ x: 5, y: 10, z: 5 });
});
