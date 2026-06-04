import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  idx,
} from '../world/chunk';
import { BLOCK, type BlockId } from '../world/block';
import { generateBlocks, generateHeightmap } from '../world/generator';
import {
  meshChunk,
  meshChunkWater,
  type ChunkMesh,
  type NeighborBlockAt,
} from '../render/mesher';

export interface NeighborChunks {
  nx?: Uint8Array;
  px?: Uint8Array;
  nz?: Uint8Array;
  pz?: Uint8Array;
}

export interface ChunkWorkerRequest {
  id: number;
  chunkX: number;
  chunkZ: number;
  seed: number;
  blocks?: Uint8Array; // 与えられたら生成スキップ、与えなければ seed から生成
  neighbors: NeighborChunks;
}

export interface ChunkWorkerResponse {
  id: number;
  blocks: Uint8Array;
  opaque: ChunkMesh;
  water: ChunkMesh;
}

function makeNeighborCallback(neighbors: NeighborChunks): NeighborBlockAt {
  return (x, y, z) => {
    if (y < 0 || y >= CHUNK_SIZE_Y) return BLOCK.AIR;
    const xOut = x < 0 ? -1 : x >= CHUNK_SIZE_X ? 1 : 0;
    const zOut = z < 0 ? -1 : z >= CHUNK_SIZE_Z ? 1 : 0;
    // 対角は渡してないので AIR 扱い（AO の角がわずかに不正確になるだけ）
    if (xOut !== 0 && zOut !== 0) return BLOCK.AIR;
    if (xOut === -1) {
      return (neighbors.nx?.[idx(CHUNK_SIZE_X - 1, y, z)] as BlockId) ?? BLOCK.AIR;
    }
    if (xOut === 1) {
      return (neighbors.px?.[idx(0, y, z)] as BlockId) ?? BLOCK.AIR;
    }
    if (zOut === -1) {
      return (neighbors.nz?.[idx(x, y, CHUNK_SIZE_Z - 1)] as BlockId) ?? BLOCK.AIR;
    }
    if (zOut === 1) {
      return (neighbors.pz?.[idx(x, y, 0)] as BlockId) ?? BLOCK.AIR;
    }
    return BLOCK.AIR;
  };
}

self.onmessage = (e: MessageEvent<ChunkWorkerRequest>) => {
  const req = e.data;

  const blocks = req.blocks
    ? req.blocks
    : generateBlocks(generateHeightmap(req.chunkX, req.chunkZ, req.seed));

  const cb = makeNeighborCallback(req.neighbors);
  const opaque = meshChunk(blocks, cb);
  const water = meshChunkWater(blocks, cb);

  const response: ChunkWorkerResponse = { id: req.id, blocks, opaque, water };
  const transfers: Transferable[] = [
    blocks.buffer,
    opaque.positions.buffer,
    opaque.normals.buffer,
    opaque.colors.buffer,
    opaque.indices.buffer,
    water.positions.buffer,
    water.normals.buffer,
    water.colors.buffer,
    water.indices.buffer,
  ];
  self.postMessage(response, transfers);
};
