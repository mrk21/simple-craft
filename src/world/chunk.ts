export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 128;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_VOLUME = CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z;

export function idx(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

export interface ChunkLocal {
  cx: number;
  cz: number;
  lx: number;
  y: number;
  lz: number;
}

export function worldToChunkLocal(
  worldX: number,
  worldY: number,
  worldZ: number,
): ChunkLocal | null {
  if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return null;
  const cx = Math.floor(worldX / CHUNK_SIZE_X);
  const cz = Math.floor(worldZ / CHUNK_SIZE_Z);
  // 負数対応の正の剰余
  const lx = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
  const lz = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
  return { cx, cz, lx, y: worldY, lz };
}
