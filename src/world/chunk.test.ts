import { test, expect } from 'vitest';
import { idx } from './chunk';

test('原点 (0, 0, 0) のインデックスは 0', () => {
  expect(idx(0, 0, 0)).toBe(0);
});
