import { test, expect } from 'vitest';
import {
  consumeMouseDelta,
  createInputState,
  discardMouseDelta,
} from './input';

test('createInputState: 初期状態は空', () => {
  const s = createInputState();
  expect(s.keys.size).toBe(0);
  expect(s.mouseDX).toBe(0);
  expect(s.mouseDY).toBe(0);
});

test('consumeMouseDelta: 累積値を返し、状態をリセット', () => {
  const s = createInputState();
  s.mouseDX = 10;
  s.mouseDY = -5;
  const [dx, dy] = consumeMouseDelta(s);
  expect(dx).toBe(10);
  expect(dy).toBe(-5);
  expect(s.mouseDX).toBe(0);
  expect(s.mouseDY).toBe(0);
});

test('consumeMouseDelta: 累積なしは [0, 0]', () => {
  const s = createInputState();
  const [dx, dy] = consumeMouseDelta(s);
  expect(dx).toBe(0);
  expect(dy).toBe(0);
});

test('discardMouseDelta: 何も返さず状態だけクリア', () => {
  const s = createInputState();
  s.mouseDX = 100;
  s.mouseDY = 100;
  discardMouseDelta(s);
  expect(s.mouseDX).toBe(0);
  expect(s.mouseDY).toBe(0);
});
