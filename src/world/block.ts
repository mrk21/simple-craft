export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  STONE: 2,
  SAND: 3,
  WATER: 4,
} as const;

export type BlockId = (typeof BLOCK)[keyof typeof BLOCK];

export type BlockKind = 'air' | 'opaque' | 'transparent';

export type BlockFaces = 'uniform' | 'top-bottom-side';

export type RGB = readonly [number, number, number];

interface BlockProps {
  kind: BlockKind;
  faces: BlockFaces;
  color: RGB;
}

const PROPS: Record<BlockId, BlockProps> = {
  [BLOCK.AIR]: { kind: 'air', faces: 'uniform', color: [0, 0, 0] },
  [BLOCK.GRASS]: { kind: 'opaque', faces: 'top-bottom-side', color: [108, 184, 73] },
  [BLOCK.STONE]: { kind: 'opaque', faces: 'uniform', color: [128, 128, 128] },
  [BLOCK.SAND]: { kind: 'opaque', faces: 'uniform', color: [218, 192, 134] },
  [BLOCK.WATER]: { kind: 'transparent', faces: 'uniform', color: [60, 120, 200] },
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
