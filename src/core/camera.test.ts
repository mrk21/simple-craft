import { test, expect } from 'vitest';
import {
  VIEW_DISTANCE,
  computeCameraTransform,
  nextViewMode,
} from './camera';

test('nextViewMode 循環: first → third-back → third-front → first', () => {
  expect(nextViewMode('first')).toBe('third-back');
  expect(nextViewMode('third-back')).toBe('third-front');
  expect(nextViewMode('third-front')).toBe('first');
});

test('first: 目の位置 + yaw/pitch そのまま', () => {
  const t = computeCameraTransform(10, 64, 5, 1.62, 0.5, 0.2, 'first');
  expect(t.posX).toBe(10);
  expect(t.posY).toBe(64 + 1.62);
  expect(t.posZ).toBe(5);
  expect(t.rotY).toBe(0.5);
  expect(t.rotX).toBe(0.2);
});

test('third-back: 背後 (yaw=0, pitch=0)', () => {
  // yaw=0, pitch=0 → forward = (0, 0, -1)、背後 = (0, 0, +1) × VIEW_DISTANCE
  const t = computeCameraTransform(0, 0, 0, 1.6, 0, 0, 'third-back');
  expect(t.posX).toBeCloseTo(0);
  expect(t.posY).toBeCloseTo(1.6);
  expect(t.posZ).toBeCloseTo(VIEW_DISTANCE);
  expect(t.rotY).toBe(0);
  expect(t.rotX).toBe(0);
});

test('third-back: 背後 (yaw=π/2)', () => {
  // yaw=π/2 → forward = (-1, 0, 0)、背後 = (+1, 0, 0) × VIEW_DISTANCE
  const t = computeCameraTransform(
    0,
    0,
    0,
    0,
    Math.PI / 2,
    0,
    'third-back',
  );
  expect(t.posX).toBeCloseTo(VIEW_DISTANCE);
  expect(t.posZ).toBeCloseTo(0);
});

test('third-front: 前方 + 反転回転', () => {
  // yaw=0, pitch=0 → forward = (0, 0, -1)、前方 = (0, 0, -VIEW_DISTANCE)
  const t = computeCameraTransform(0, 0, 0, 1.6, 0, 0, 'third-front');
  expect(t.posX).toBeCloseTo(0);
  expect(t.posZ).toBeCloseTo(-VIEW_DISTANCE);
  // 視線反転
  expect(t.rotY).toBeCloseTo(Math.PI);
  expect(t.rotX).toBeCloseTo(0); // -0 = 0
});

test('third-front: pitch も反転', () => {
  const t = computeCameraTransform(0, 0, 0, 0, 0, 0.3, 'third-front');
  expect(t.rotX).toBeCloseTo(-0.3);
});

test('viewDistance を上書きできる', () => {
  const t = computeCameraTransform(0, 0, 0, 0, 0, 0, 'third-back', 10);
  expect(t.posZ).toBeCloseTo(10);
});
