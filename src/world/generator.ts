import { createNoise2D } from 'simplex-noise';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
  idx,
} from './chunk';
import { BLOCK } from './block';
import { createPrng } from './prng';

export const SEA_LEVEL = 62;

const BASE_HEIGHT = 64;
const AMPLITUDE = 20;
const FREQUENCY = 0.02;

export function generateHeightmap(
  chunkX: number,
  chunkZ: number,
  seed: number,
): Uint8Array {
  const noise2D = createNoise2D(createPrng(seed));
  const heights = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const worldX = chunkX * CHUNK_SIZE_X + x;
      const worldZ = chunkZ * CHUNK_SIZE_Z + z;
      const n = noise2D(worldX * FREQUENCY, worldZ * FREQUENCY);
      heights[x + z * CHUNK_SIZE_X] = Math.floor(BASE_HEIGHT + n * AMPLITUDE);
    }
  }
  return heights;
}

export function generateBlocks(heightmap: Uint8Array): Uint8Array {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const h = heightmap[x + z * CHUNK_SIZE_X];
      const top = h > SEA_LEVEL ? BLOCK.GRASS : BLOCK.SAND;
      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        if (y < h) {
          blocks[idx(x, y, z)] = BLOCK.STONE;
        } else if (y === h) {
          blocks[idx(x, y, z)] = top;
        } else if (y <= SEA_LEVEL) {
          blocks[idx(x, y, z)] = BLOCK.WATER;
        }
        // y > SEA_LEVEL: AIR (= 0, default)
      }
    }
  }
  return blocks;
}
