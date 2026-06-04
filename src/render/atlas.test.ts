import { test, expect } from "vitest";
import {
  ATLAS_COLS,
  ATLAS_H,
  ATLAS_W,
  FACE_UV_CORNERS,
  PADDING,
  TEX,
  TEX_SIZE,
  textureSlotFor,
  uvBoxForSlot,
} from "./atlas";
import { BLOCK } from "../world/block";

test("アトラスサイズ: タイル(16) + パディング(1) × グリッド本数と一致", () => {
  const stride = TEX_SIZE + PADDING * 2;
  expect(ATLAS_W).toBe(ATLAS_COLS * stride);
  expect(ATLAS_H).toBeGreaterThan(0);
  expect(ATLAS_H % stride).toBe(0);
});

test("uvBoxForSlot(GRASS_TOP): 先頭スロットはパディング1px の位置から始まる", () => {
  const box = uvBoxForSlot(TEX.GRASS_TOP);
  expect(box.u0).toBeCloseTo(PADDING / ATLAS_W);
  expect(box.v0).toBeCloseTo(PADDING / ATLAS_H);
  expect(box.u1).toBeCloseTo((PADDING + TEX_SIZE) / ATLAS_W);
  expect(box.v1).toBeCloseTo((PADDING + TEX_SIZE) / ATLAS_H);
});

test("uvBoxForSlot: 幅・高さはタイルサイズ", () => {
  for (const slot of Object.values(TEX)) {
    const box = uvBoxForSlot(slot);
    expect((box.u1 - box.u0) * ATLAS_W).toBeCloseTo(TEX_SIZE);
    expect((box.v1 - box.v0) * ATLAS_H).toBeCloseTo(TEX_SIZE);
  }
});

test("uvBoxForSlot: 全スロットの矩形は互いに重ならない", () => {
  const slots = Object.values(TEX);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = uvBoxForSlot(slots[i]);
      const b = uvBoxForSlot(slots[j]);
      const overlap =
        a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
      expect(overlap, `slot ${slots[i]} と ${slots[j]} の矩形が重複`).toBe(false);
    }
  }
});

test("textureSlotFor(GRASS): 上面=GRASS_TOP, 下面=DIRT, 側面=GRASS_SIDE", () => {
  expect(textureSlotFor(BLOCK.GRASS, 2)).toBe(TEX.GRASS_TOP);
  expect(textureSlotFor(BLOCK.GRASS, 3)).toBe(TEX.DIRT);
  for (const f of [0, 1, 4, 5]) {
    expect(textureSlotFor(BLOCK.GRASS, f)).toBe(TEX.GRASS_SIDE);
  }
});

test("textureSlotFor(STONE/SAND): 全面同じスロット", () => {
  for (let f = 0; f < 6; f++) {
    expect(textureSlotFor(BLOCK.STONE, f)).toBe(TEX.STONE);
    expect(textureSlotFor(BLOCK.SAND, f)).toBe(TEX.SAND);
  }
});

test("textureSlotFor: 全水ブロック(WATER/F1/F2/F3)は WATER スロット", () => {
  const waters = [BLOCK.WATER, BLOCK.WATER_F1, BLOCK.WATER_F2, BLOCK.WATER_F3];
  for (const w of waters) {
    for (let f = 0; f < 6; f++) {
      expect(textureSlotFor(w, f)).toBe(TEX.WATER);
    }
  }
});

test("FACE_UV_CORNERS: 各面 4 コーナーが (0,0)(0,1)(1,0)(1,1) を一度ずつ含む", () => {
  for (let f = 0; f < 6; f++) {
    const corners = FACE_UV_CORNERS[f];
    expect(corners.length).toBe(4);
    const set = new Set(corners.map((c) => `${c[0]},${c[1]}`));
    expect(set.has("0,0")).toBe(true);
    expect(set.has("0,1")).toBe(true);
    expect(set.has("1,0")).toBe(true);
    expect(set.has("1,1")).toBe(true);
  }
});

test("FACE_UV_CORNERS 側面: y=低 のコーナーは v=1(下), y=高 は v=0(上)", () => {
  // mesher の FACES と整合: 側面は corners[0]=下, [1]=上, [2]=上, [3]=下
  for (const f of [0, 1, 4, 5]) {
    const corners = FACE_UV_CORNERS[f];
    expect(corners[0][1], `face ${f} corner 0 should be bottom (v=1)`).toBe(1);
    expect(corners[1][1], `face ${f} corner 1 should be top (v=0)`).toBe(0);
    expect(corners[2][1], `face ${f} corner 2 should be top (v=0)`).toBe(0);
    expect(corners[3][1], `face ${f} corner 3 should be bottom (v=1)`).toBe(1);
  }
});
