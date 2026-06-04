import { test, expect } from 'vitest';
import {
  ARM_SWING_DURATION,
  advanceAnimationState,
  type PlayerAnimationState,
} from './player-entity';

function initialState(): PlayerAnimationState {
  return { walkPhase: 0, walkSwingAmount: 0, armSwingTime: -1 };
}

test('歩いていない時 walkSwingAmount は 0 のまま、walkPhase 進まない', () => {
  const s = initialState();
  advanceAnimationState(s, 0.1, { isWalking: false, walkSpeed: 0 });
  expect(s.walkSwingAmount).toBe(0);
  expect(s.walkPhase).toBe(0);
});

test('歩行開始: walkSwingAmount が 0 から増加する', () => {
  const s = initialState();
  advanceAnimationState(s, 0.05, { isWalking: true, walkSpeed: 4.3 });
  expect(s.walkSwingAmount).toBeGreaterThan(0);
  expect(s.walkSwingAmount).toBeLessThanOrEqual(1);
  expect(s.walkPhase).toBeGreaterThan(0);
});

test('歩行継続: walkSwingAmount は 1 を超えない', () => {
  const s = initialState();
  // たくさん進める
  for (let i = 0; i < 100; i++) {
    advanceAnimationState(s, 0.05, { isWalking: true, walkSpeed: 4.3 });
  }
  expect(s.walkSwingAmount).toBe(1);
});

test('歩行停止: walkSwingAmount が減衰して 0 に戻る', () => {
  const s = initialState();
  s.walkSwingAmount = 1;
  for (let i = 0; i < 100; i++) {
    advanceAnimationState(s, 0.05, { isWalking: false, walkSpeed: 0 });
  }
  expect(s.walkSwingAmount).toBe(0);
});

test('armSwingTime: -1 のままなら advance しない', () => {
  const s = initialState();
  advanceAnimationState(s, 0.05, { isWalking: false, walkSpeed: 0 });
  expect(s.armSwingTime).toBe(-1);
});

test('armSwingTime: 0 から開始すると時間が進む', () => {
  const s = initialState();
  s.armSwingTime = 0;
  advanceAnimationState(s, 0.05, { isWalking: false, walkSpeed: 0 });
  expect(s.armSwingTime).toBeCloseTo(0.05);
});

test('armSwingTime: ARM_SWING_DURATION を超えると -1 にリセット', () => {
  const s = initialState();
  s.armSwingTime = ARM_SWING_DURATION - 0.01;
  advanceAnimationState(s, 0.05, { isWalking: false, walkSpeed: 0 });
  expect(s.armSwingTime).toBe(-1);
});
