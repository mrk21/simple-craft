export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  STONE: 2,
  SAND: 3,
  WATER: 4, // ソース（不滅）
  WATER_F1: 5, // 流動レベル 1（ソースに最も近い）
  WATER_F2: 6, // 流動レベル 2
  WATER_F3: 7, // 流動レベル 3（最遠、これ以上広がらない）
} as const;

export const MAX_FLOWING_LEVEL = 3;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];

export type BlockKind = 'air' | 'opaque' | 'transparent';

export type BlockFaces = 'uniform' | 'top-bottom-side';

export type RGB = readonly [number, number, number];

interface BlockProps {
  kind: BlockKind;
  faces: BlockFaces;
  color: RGB;
}

const WATER_COLOR: RGB = [60, 120, 200];

const PROPS: Record<BlockId, BlockProps> = {
  [BLOCK.AIR]: { kind: 'air', faces: 'uniform', color: [0, 0, 0] },
  [BLOCK.GRASS]: { kind: 'opaque', faces: 'top-bottom-side', color: [108, 184, 73] },
  [BLOCK.STONE]: { kind: 'opaque', faces: 'uniform', color: [128, 128, 128] },
  [BLOCK.SAND]: { kind: 'opaque', faces: 'uniform', color: [218, 192, 134] },
  [BLOCK.WATER]: { kind: 'transparent', faces: 'uniform', color: WATER_COLOR },
  [BLOCK.WATER_F1]: { kind: 'transparent', faces: 'uniform', color: WATER_COLOR },
  [BLOCK.WATER_F2]: { kind: 'transparent', faces: 'uniform', color: WATER_COLOR },
  [BLOCK.WATER_F3]: { kind: 'transparent', faces: 'uniform', color: WATER_COLOR },
};

export function blockKind(id: BlockId): BlockKind {
  return PROPS[id].kind;
}

export function blockFaces(id: BlockId): BlockFaces {
  return PROPS[id].faces;
}

export function blockColor(id: BlockId): RGB {
  return PROPS[id].color;
}

export function isWaterBlock(id: BlockId): boolean {
  return (
    id === BLOCK.WATER ||
    id === BLOCK.WATER_F1 ||
    id === BLOCK.WATER_F2 ||
    id === BLOCK.WATER_F3
  );
}

// 水ブロックのレベル: SOURCE=0、FLOWING_N=N、非水=-1
export function waterLevel(id: BlockId): number {
  switch (id) {
    case BLOCK.WATER: return 0;
    case BLOCK.WATER_F1: return 1;
    case BLOCK.WATER_F2: return 2;
    case BLOCK.WATER_F3: return 3;
    default: return -1;
  }
}

// 1〜MAX_FLOWING_LEVEL に対応する流動水ブロックID
export function flowingWaterForLevel(level: number): BlockId {
  switch (level) {
    case 1: return BLOCK.WATER_F1;
    case 2: return BLOCK.WATER_F2;
    case 3: return BLOCK.WATER_F3;
    default: return BLOCK.AIR;
  }
}
