import {
  BLOCK,
  MAX_FLOWING_LEVEL,
  type BlockId,
  blockKind,
  flowingWaterForLevel,
  isWaterBlock,
  waterLevel,
} from '../world/block';

// 水流ティック間隔（5Hz = 0.2s）
export const WATER_TICK_INTERVAL = 0.2;

// 「再評価が必要なセル」の集合。tick 時に処理してクリアされる
export interface WaterFlowState {
  tickAcc: number;
  pending: Set<string>;
}

export function createWaterFlowState(): WaterFlowState {
  return { tickAcc: 0, pending: new Set() };
}

export function wkey(wx: number, wy: number, wz: number): string {
  return `${wx},${wy},${wz}`;
}

export function parseWkey(k: string): [number, number, number] {
  const [wx, wy, wz] = k.split(',').map(Number);
  return [wx, wy, wz];
}

export function markPendingCell(
  state: WaterFlowState,
  wx: number,
  wy: number,
  wz: number,
): void {
  state.pending.add(wkey(wx, wy, wz));
}

export function markPendingWithNeighbors(
  state: WaterFlowState,
  wx: number,
  wy: number,
  wz: number,
): void {
  markPendingCell(state, wx, wy, wz);
  markPendingCell(state, wx + 1, wy, wz);
  markPendingCell(state, wx - 1, wy, wz);
  markPendingCell(state, wx, wy + 1, wz);
  markPendingCell(state, wx, wy - 1, wz);
  markPendingCell(state, wx, wy, wz + 1);
  markPendingCell(state, wx, wy, wz - 1);
}

export type BlockAtFn = (wx: number, wy: number, wz: number) => BlockId;

// 純粋関数: 周囲セルから新しい状態を計算
// - SOURCE は不滅
// - 上に水があれば滝 (F1)
// - 直下が床 (opaque) で支えられた隣接水のみが水平に広がる
// - MAX_FLOWING_LEVEL を超える流動は AIR に
export function computeWaterState(
  wx: number,
  wy: number,
  wz: number,
  current: BlockId,
  blockAt: BlockAtFn,
): BlockId {
  if (current === BLOCK.WATER) return BLOCK.WATER;
  if (blockKind(current) === 'opaque') return current;

  // 上に水 → 落下水
  const above = blockAt(wx, wy + 1, wz);
  if (isWaterBlock(above)) return BLOCK.WATER_F1;

  // 横の最低レベル水（直下が opaque なものだけが広がる）
  let minLevel = MAX_FLOWING_LEVEL + 1;
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dz] of dirs) {
    const nx = wx + dx;
    const nz = wz + dz;
    const n = blockAt(nx, wy, nz);
    if (!isWaterBlock(n)) continue;
    const belowN = blockAt(nx, wy - 1, nz);
    if (blockKind(belowN) !== 'opaque') continue;
    const lvl = waterLevel(n);
    if (lvl >= 0 && lvl < minLevel) minLevel = lvl;
  }
  if (minLevel >= MAX_FLOWING_LEVEL) return BLOCK.AIR;
  return flowingWaterForLevel(minLevel + 1);
}
