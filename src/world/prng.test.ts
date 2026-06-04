import { test, expect } from 'vitest';
import { createPrng } from './prng';

test('同じシードからは同じ値が出る', () => {
  const a = createPrng(12345);
  const b = createPrng(12345);
  expect(a()).toBe(b());
});

test('異なるシードからは異なる値が出る', () => {
  const a = createPrng(12345);
  const b = createPrng(67890);
  expect(a()).not.toBe(b());
});

test('戻り値は [0, 1) の範囲に収まる', () => {
  const rng = createPrng(12345);
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test('連続呼び出しで異なる値が出る', () => {
  const rng = createPrng(12345);
  expect(rng()).not.toBe(rng());
});

test('大量サンプルの平均は 0.5 付近に収まる', () => {
  const rng = createPrng(12345);
  const n = 100000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rng();
  const mean = sum / n;
  expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
});
